const ffmpeg = require('fluent-ffmpeg');
const speech = require('@google-cloud/speech');
const fs = require('fs');
const throttle = require('stream-throttle');
const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);

// Globals
var wordData = {};
var wordPenalities = {};
var users = [{name: "Dev", session: "", guesses: ["apple", "deep", "person"], score: 0}];
var timeToStart = 60 * 10; // 10 Mins
var title = "Apple: Keynote";

// Socket Setup
io.on('connection', function(socket) {
    start();
    console.log('a user connected');
    // Let them know the timestamp
    socket.emit('time', timeToStart);
    socket.emit('title', title);
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
    });
});

//var command = ffmpeg('/Users/kieranwebber/Music/iTunes/iTunes Media/Podcasts/Apple Keynotes/Apple Special Event, September 2017.m4v');
var wordData = {};
var wordPenalities = {};
var users = [{name: "Dev", session: "", guesses: ["apple", "deep", "person"], score: 0}];

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
    users.forEach(function(user) {
        var score = 0;
        user.guesses.forEach(function(guess) {
            guess = guess.toLowerCase();
            if (guess in wordData) {
                score += (wordData[guess] * 100);
            }
        });
        user.score = score;
    });
    users.sort(compareUsers);
}

// Creates a client
const client = new speech.SpeechClient();
//const filename = '/Users/kieranwebber/Workspace/FacebookHack/backend/audio.flac';
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

function performASR(uri) {
    var tg = new throttle.ThrottleGroup({rate: 26000});
    var command = ffmpeg(uri);
    const recognizeStream = client
        .streamingRecognize(request)
        .on('error', console.error)
        .on('data', data => {
            console.log(data);
            if (! data.results[0]) {
                performASR(uri);
                return;
            }
            var transcript = data.results[0].alternatives[0].transcript.toLowerCase();
            var transcript = stripPunctuation(transcript);
            transcript.split(' ').forEach(function(word) {
                if (word.length > 0) {
                    word in wordData ? wordData[word] += 1 : wordData[word] = 1;
                }
            });
            //console.log(wordData);
            console.log(data.results[0].alternatives[0].transcript);
            calculateScores();
            //console.log(users);
            // Publish Event
            io.emit('scores', users);
    });
    command.audioChannels(1)
    .format('flac')
    .audioFrequency(sampleRateHertz)
    .audioFilters([
        {
          filter: 'lowpass',
          options: '4000'
        },
        {
          filter: 'highpass',
          options: '300'
        }
    ])
    .pipe(tg.throttle())
    .pipe(recognizeStream);
}
function start() {
    setInterval(function() {timeToStart -= 1;}, 1000);
    performASR('https://video-weaver.fra02.hls.ttvnw.net/v1/playlist/CsgCXmXl1Jr1MuvyfVbvmCIMgShi6Y1VZ7zSljHNhcsUO-umhI1zdjZk8X3WtwOpITIQ4qfywLlhZZh_lSdFK0Z2dgRTfERcd0U3OcvNMRM42t8Z52e2dKU_BJnBtNKYmOTx_Cm8OaEIvZB7_SonCes-8V6u9tIK48azH6TxkIQap18B_jtlnK0rxvHx6zNw6QtsB4Jmxo9OhG1j0EO3MADIbdYy467glUavANoei7LTh7yzmZlxei7HPd6_BkJFNW_I_MzzyqB73LRUuSnKgh_8YdtahXntIqQOK5Vn0emjeWuZmOGVs0Ps5JfVQNtwg8VhKsgzQ5Fq_9RCmnBjkMOD7nsIW7mahQ0U99iNaIfqQ9Xxct9C03ryTHEV5_ihH0DlQNIQq9pmRTf5n2DhMMc4zqAg3IVUAadq0dzrS8AK2I52TluwFHKZaRIQXMEOFcAxomvF7hdRRl0b3hoMJ8Et7OW-Mu9fbDhn.m3u8');
}
/*command.audioChannels(1).output('./audio.flac').on('end', function() {
    console.log('conversion ended');
    callback(null);
}).on('error', function(err){
    console.log('error: ', e.code, e.msg);
    callback(err);
}).run();*/
