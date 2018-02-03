const ffmpeg = require('fluent-ffmpeg');
const speech = require('@google-cloud/speech');
const fs = require('fs');
const throttle = require('stream-throttle');
const CircularBuffer = require("circular-buffer");
const express = require('express');
const app = express();
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));
const http = require('http').Server(app);
const io = require('socket.io')(http);
//var HLSServer = require('hls-server')
/*var hls = new HLSServer(http, {
    path: '/streams',     // Base URI to output HLS streams
    dir: 'public'  // Directory that input files are stored
});*/

/*ffmpeg('public/keynote.m4v', { timeout: 432000 }).addOptions([
    '-profile:v baseline', // baseline profile (level 3.0) for H264 video codec
    '-level 3.0',
    '-s 640x360',          // 640px width, 360px height output video dimensions
    '-start_number 0',     // start the first .ts segment at index 0
    '-hls_time 4',        // 10 second segment duration
    '-hls_list_size 2',    // Maxmimum number of playlist entries (0 means all entries/infinite)
    '-f hls'               // HLS format
]).output('public/output.m3u8').run()*/

// Globals
var wordData = {};
var users = [{name: "Dev", session: "", guesses: ["to be as a person", "person"], guessesScore: [0, 0], score: 0}];
var timeToStart = 1; // 10 Mins
var title = "Apple: Keynote";
var lastWords = new CircularBuffer(5);
var timeStamp = Math.floor(Date.now());


function getVideoTimestamp() {
    return (Math.floor(Date.now()) - timeStamp) / 1000.0;
}

// Socket Setup
io.on('connection', function(socket) {
    start();
    console.log('a user connected');
    // Let them know the timestamp
    socket.emit('sync', {time: timeToStart, title: title, start: timeToStart > 0 ? -1 : getVideoTimestamp()});
    socket.on('register', function(user) {
        if (timeToStart <= 0) {
            socket.emit('late', 'too late');
        }
        for(var i = 0; i < users.length; i++) {
            // Forgive and replace
            if (users[i].session == user.session) {
                users[i] = user;
                break;
            }
        }
        users.add(user);
    });
});

function compareUsers(userA, userB) {
    if (userA.score < userB.score)
        return -1;
    if(userA.score > userB.score)
        return 1;
    return 0;
}

function stripPunctuation(str) {
    return str.replace(/[&\/\\#,+\(\)$~%\.!^'"\;:*?\[\]<>{}]/g, '');
}

function calculateScores() {
    var lastFive = lastWords.toarray().reverse();
    //console.log(lastFive);
    users.forEach(function(user) {
        var score = user.score;
        user.guesses.forEach(function(guess) {
            guess = guess.toLowerCase().trim().split(" ");
            var tempCounter = 0;
            if (guess.length > 1 && guess.length <= 5) {
                for (var i = 0; i < guess.length; i++) {
                    if (guess[i] === lastFive[5 - guess.length + i]) {
                       tempCounter++;
                    }
                }
                if (tempCounter === guess.length) {
                    score += guess.length * 3;
                    user.guessesScore[user.guesses.indexOf(guess)] += guess.length * 3;
                }
            } else if (guess.length === 1) {
                if (guess[0] === lastFive[4]) {
                    score++;
                    user.guessesScore[user.guesses.indexOf(guess)]++;
                }
            }else {
                console.log("something must be wrong with the validation")
            }
        });
        user.score = score;
        console.log(user.score);
    });
    /*users.forEach(function(user) {
        var score = 0;
        user.guesses.forEach(function(guess) {
            guess = guess.toLowerCase();
            if (guess in wordData) {
                score += (wordData[guess] * 100);
            }
        });
        user.score = score;
    });*/
}

// Creates a client
const client = new speech.SpeechClient();
const encoding = 'FLAC';
const sampleRateHertz = 48000;
const languageCode = 'en-US';

const request = {
  config: {
    encoding: encoding,
    sampleRateHertz: sampleRateHertz,
    languageCode: languageCode,
  },
  interimResults: false
};

function performASR() {
    console.log('Starting ASR');
    var tg = new throttle.ThrottleGroup({rate: 26000});
    var command = ffmpeg('public/keynote.m4v');
    const recognizeStream = client
        .streamingRecognize(request)
        .on('error', console.error)
        .on('data', data => {
            //console.log(data);
            if (! data.results[0]) {
                performASR();
                return;
            }
            var transcript = data.results[0].alternatives[0].transcript.toLowerCase();
            var transcript = stripPunctuation(transcript);
            console.log(transcript);
            transcript.split(' ').forEach(function(word) {
                if (word.length > 0) {
                    word in wordData ? wordData[word] += 1 : wordData[word] = 1;
                    lastWords.enq(word);
                    calculateScores();
                }
            });
            //console.log(transcript);
            /*var words = transcript.split(' ');
            var word = words[words.length - 1];
            //console.log(word);
            //console.log(data);
            for(var i = words.length -1; i >= word.length - 3 && i >= 0; i--) {
                var word = words[i];
                if (word == lastWord) {
                    break;
                }
                if (word && word.length > 2) {
                    word in wordData ? wordData[word] += 1 : wordData[word] = 1;
                    console.log(lastWord);
                }
            }
            lastWord = words[words.length -1];*/
            //console.log(wordData);
            //console.log(data.results[0].alternatives[0].transcript);
            users.sort(compareUsers);
            //console.log(users);
            // Publish Event
            console.log("Score: " + users[0].score);
            io.emit('scores', users);
    });
    command.audioChannels(1)
    .format('flac')
    .setStartTime(getVideoTimestamp())
    .audioFrequency(sampleRateHertz)
    .audioFilters([
        {
          filter: 'lowpass',
          options: '4500'
        },
        {
          filter: 'highpass',
          options: '200'
        }
    ])
    .pipe(tg.throttle())
    .pipe(recognizeStream);
}
function start() {
    io.emit('start', {});
    var interval = setInterval(function() {
        console.log("Time Left: " + timeToStart);
        timeToStart -= 1;
        if (timeToStart == 0) {
            clearInterval(interval);
            performASR();
        }
    }, 1000);
}

http.listen(3000, function(){
  console.log('listening on *:3000');
  setTimeout(start, 0);
});
