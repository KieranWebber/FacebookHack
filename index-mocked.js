const fs = require('fs');
const CircularBuffer = require("circular-buffer");
const express = require('express');
const app = express();
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));
const http = require('http').Server(app);
const io = require('socket.io')(http);

// Globals
var wordData = {};
var users = [{name: "Dev", session: "", guesses: ["be", "camera", "augmented reality", "has", "tools"], guessesScore: [0, 0, 0, 0, 0], score: 0}];
var timeToStart = 1; // 10 Mins
var title = "Facebook F8";
var lastWords = new CircularBuffer(5);
var timeStamp = Math.floor(Date.now());
var video = "keynote-gb.m4v";
var mockedAudio = {
    "i4": "We are making the camera the first Augmented reality platform",
    "i7": "Alright so you are going to swipe the camera",
    "i11": "And you are going to start discovering effects that your friends are using",
    "i14": "And that are relevant to the place you are at nearby",
    "i17": "So now for real augmented reality",
    "i19": "You don’t just want the ability to do those tools",
    "i22": "You also want the ability to have realistic 3d objects",
    "i25": "And in order to do that",
    "i27": "You need to have a platform that has",
    "i30": "That gives them precise location a realistic relationship",
    "i33": "With objects around them in their environment"
};
var file = fs.readFileSync(path.join(__dirname, 'source.csv'), "utf8");
var csvString = file.split(",").join(" ").split("\r\n").join(" ").split(" ");


function getVideoTimestamp() {
    return (Math.floor(Date.now()) - timeStamp) / 1000.0;
}

// Socket Setup
io.on('connection', function(socket) {
    //start();
    console.log('a user connected');
    // Let them know the timestamp
    setTimeout(function() {
        socket.emit('sync', {time: timeToStart, title: title, start: timeToStart > 0 ? -1 : getVideoTimestamp(), videoUrl: video});
    }, 1000);
    socket.on('register', function(user) {
        if (timeToStart <= 0) {
            socket.emit('late', 'too late');
        }
        for(var i = 0; i < users.length; i++) {
            // Forgive and replace
            if (users[i].session === user.session) {
                user.score = 0;
                user.guessesScore = [0, 0, 0, 0, 0];
                users[i] = user;
                return;
            }
        }
        user.score = 0;
        user.guesses = [];
        user.guessesScore = [0, 0, 0, 0, 0];
        users.push(user);
    });
    socket.on('message', function(msg) {
        console.log('message: ' + msg);
        socket.broadcast.emit('message', msg);
    });
    socket.on('getUser', function(msg) {
        console.log("User Req");
        for(var i = 0; i < users.length; i++) {
            if (users[i].session == msg) {
                socket.emit('userInfo', users[i]);
                return;
            }
        }
        socket.emit('userInfo', {name: "", session: msg, guesses: [], guessesScore: [], score: 0});
    });
});

function compareUsers(userA, userB) {
    if (userA.score < userB.score)
        return 1;
    if(userA.score > userB.score)
        return -1;
    return 0;
}

function stripPunctuation(str) {
    return str.replace(/[&\/\\#,+\(\)$~%\.!^'"\;:*?\[\]<>{}]/g, '');
}
function getHighestScoring() {
    users.forEach(function(user) {

    });
}

function csvArrayMaker(csvString){
    var csvArray = {};

    for (var i = 0; i <= csvString.length; i += 2) {

        csvArray[csvString[i]] = csvString[i+1];
    }
    return csvArray;
}

function wordValue(word) {
    var csvArray = csvArrayMaker(csvString);
    if (csvArray[word] === undefined) {
        return 100;
    }else if (csvArray[word] > 200000){
        return 0;
    }else{
        return 100-csvArray[word]*100/200000;

    }
}

function calculateScores() {
    var lastFive = lastWords.toarray().reverse();
    //console.log(lastFive);
    users.forEach(function(user) {
        var score = user.score;
        user.guesses.forEach(function(guess) {
            var oriGuess = guess;
            guess = guess.toLowerCase().trim().split(" ");
            var tempCounter = 0;
            if (guess.length > 1 && guess.length <= 5) {
                var tempScore = 0;
                for (var i = 0; i < guess.length; i++) {
                    if (guess[i] === lastFive[5 - guess.length + i]) {
                        tempCounter++;
                        tempScore = wordValue(guess[i]);
                    }
                }
                if (tempCounter === guess.length) {
                    score += tempScore * 3;
                    user.guessesScore[user.guesses.indexOf(oriGuess)] += tempScore * 3;
                }
            } else if (guess.length === 1) {
                if (guess[0] === lastFive[4]) {
                    score += wordValue(guess[0]);
                    user.guessesScore[user.guesses.indexOf(oriGuess)] += wordValue(guess[0]);
                }
            }else {
                console.log("something must be wrong with the validation")
            }
            console.log(user.guessesScore);
        });
        user.score = score;
        console.log(user.score);
    });
}

function performASR(index) {
    var sentance = mockedAudio['i'+index];
    console.log(sentance);
    var transcript = sentance.toLowerCase();
    var transcript = stripPunctuation(transcript);
    transcript.split(' ').forEach(function(word) {
        if (word.length > 0) {
            word in wordData ? wordData[word] += 1 : wordData[word] = 1;
            lastWords.enq(word);
            calculateScores();
        }
    });
    users.sort(compareUsers);
    console.log("Score: " + users[0].score);
    io.emit('scores', users);
}
function start() {
    io.emit('start', {});
    var interval = setInterval(function() {
        console.log("Time Left: " + timeToStart);
        timeToStart -= 1;
        if (timeToStart === 0) {
            //clearInterval(interval);
            timeStamp = Math.floor(Date.now());
        }

        if (('i' + (-timeToStart - 2)) in mockedAudio) {
            console.log("ASR");
            performASR(-timeToStart - 2);
        }
    }, 1000);
}

http.listen(3000, function(){
    console.log('listening on *:3000');
    start();
});
//performASR();