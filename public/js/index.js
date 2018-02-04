var messageView;
var user = false;
var initState = 0;
var playerStarted = false;
var userScores = [];

var config = {
    maxWords: 5,
    minLength: 3
};

var data = {
    words: []
};

Array.prototype.remove = function () {
    var what, a = arguments, L = a.length, ax;
    while (L && this.length) {
        what = a[--L];
        while ((ax = this.indexOf(what)) !== -1) {
            this.splice(ax, 1);
        }
    }
    return this;
};

Number.prototype.pad = function (size) {
    var s = String(this);
    while (s.length < (size || 2)) {
        s = "0" + s;
    }
    return s;
};

var timer = {
    countdown: function () {
        var now = parseInt(new Date().getTime() / 1000);
        var secondsRemaining = timer.startEpoch - now;
        if (secondsRemaining <= 0) {
            var player = $('#video-player');
            player.prop("volume", 1);
            console.log(secondsRemaining);
            console.log(player.prop('duration'));
            if (isNaN(player.prop('duration'))) {
                return;
            }
            if (-secondsRemaining > player.prop('duration')) {
                showLeaderboard();
                timer.stop();
                $("#live-leaderboard-container").hide();
                $("#chat-container").removeClass("shrink");
                nextState();
                return;
            }
            if (!playerStarted) {
                playerStarted = true;
                if (secondsRemaining < 0) {
                    player.prop('currentTime', -secondsRemaining);
                }
                player.show().trigger('play');
                $("#live-leaderboard-container").show();
                $("#chat-container").addClass("shrink");
                $("#words").removeClass("removable").addClass("ingame");
                nextState();
            }
        } else {
            var minutes = parseInt(secondsRemaining / 60);
            var seconds = secondsRemaining % 60;
            $("#timer").text(minutes.pad() + ":" + seconds.pad());
            nextState();
        }
    },
    init: function (startEpoch) {
        this.startEpoch = startEpoch;
        timer.countdown();
        this.interval = setInterval(timer.countdown, 1000);
    },
    stop: function () {
        clearInterval(this.interval)
    }
};

var chat = {
    addMessage: function (message) {
        var view = messageView.clone(true, true);
        view.find(".message").text(message.message);
        view.find(".username").text(message.username);
        view.find(".avatar").attr('src', message.avatar);
        $("#chat-container").find(".simplebar-content").append(view);
        $("#chat-container .simplebar-scroll-content").scrollTop($("#chat-container .simplebar-content").height());
    }
};

var socket = io();

$(document).ready(function () {

    messageView = $(".chat-message").clone(true, true);
    messageView.css('display', 'flex');
    $(".chat-message").remove();

    $("#compose-form").submit(function (e) {
        e.preventDefault();
        var word = $("#compose").val().trim();
        if (word.length < config.minLength || data.words.length >= config.maxWords) {
            return;
        }
        $("#compose").val("");
        data.words.push(word);
        sendWords();
        if (data.words.length >= config.maxWords) {
            $("#limiter").text("Done!");
            $("#compose").prop('disabled', true).attr('placeholder', 'Cool.');
        } else {
            $("#limiter").text(data.words.length + "/" + config.maxWords);
        }
        $("#words").append("<div class='word-bubble'>" + word + "<div class='remove' data-word='" + word + "'>Remove</div><div class='score'>0</div></div>");


        setWordsRemove();
    });

    $("#compose-chat").keypress(function (e) {
        if (e.which === 13 && !e.shiftKey) {
            var message = $(this).val();
            if (message === '') {
                return false;
            }
            $(this).val("");
            var data = {message: message, username: user.username, avatar: user.avatar};
            socket.emit('message', data);
            chat.addMessage(data);
            e.preventDefault();
            return false;
        }
    }).focus(function () {
        if (user === false) {
            displayLogin();
            $(this).blur();
            return;
        }
    });

    $("#compose").focus(function () {
        if (user === false) {
            displayLogin();
            $(this).blur();
            return;
        }
    });

    $(".login-btn").click(function () {
        FB.login(function (response) {
            console.log(response);
            if (response.status === "connected") {
                userConnected();
            }
        }, {scope: 'email,public_profile'});
    });

    socket.on('sync', function (data) {
        var time = parseInt(data.time);
        var now = parseInt(new Date().getTime() / 1000);
        $(".stream").text(data.title);
        $('#video-player source').attr('src', data.videoUrl);
        $("#video-player")[0].load();
        data.messages.forEach(function (msg) {
            chat.addMessage(msg);
        });
        timer.init(time + now);
    });

    socket.on('message', function (msg) {
        chat.addMessage(msg);
    });

    socket.on('scores', function (users) {
        console.log("SCORES");
        console.log(users);
        userScores = users;
        var leaderboard = $("#live-leaderboard");
        leaderboard.empty();
        var i = 1;
        users.forEach(function (user) {
            var score = user.score ? user.score : 0;
            leaderboard.append('<div class="leaderboard-user">' + i++ + ". " + user.name + " (" + score + " points)</div>")
        });
        for (i = 0; i < users.length; i++) {
            if (users[i].session === user.id) {
                $("#words").empty();
                for (var j = 0; j < users[i].guesses.length; j++) {
                    var word = users[i].guesses[j];
                    $("#words").append("<div class='word-bubble'>" + word + "<div class='remove' data-word='" + word + "'>Remove</div><div class='score'>" + users[i].guessesScore[j] + "</div></div>");
                }

                break;
            }
        }
    });

    socket.on('userInfo', function (d) {
        for (var i = 0; i < d.guesses.length; i++) {
            var word = d.guesses[i];
            data.words.push(word);
            $("#words").append("<div class='word-bubble'>" + word + "<div class='remove' data-word='" + word + "'>Remove</div><div class='score'>0</div></div>");
        }
        if (data.words.length >= config.maxWords) {
            $("#limiter").text("Done!");
            $("#compose").prop('disabled', true).attr('placeholder', 'Cool.');
        } else {
            $("#limiter").text(data.words.length + "/" + config.maxWords);
        }
        setWordsRemove();
        nextState();
    });

    $(".login-modal").click(function (e) {
        e.stopPropagation();
        $(this).fadeOut(200);
    });

});

window.fbAsyncInit = function () {
    FB.init({
        appId: '2066148900282817',
        cookie: true,
        xfbml: true,
        version: 'v2.12'
    });
    FB.AppEvents.logPageView();

    FB.getLoginStatus(function (response) {
        console.log(response);
        if (response.status === "connected") {
            userConnected();
        } else {
            $(".nav-item.login").show();
            nextState();
        }
    });
};

function displayLogin() {
    $(".login-modal").fadeIn(300);
}

function userConnected() {
    FB.api('/me', {fields: 'id,name,email,picture'}, function (response) {
        console.log(response);
        user = {
            id: response.id,
            email: response.email,
            name: response.name,
            username: slugify(response.name),
            avatar: response.picture.data.url
        };
        $(".nav-item.login").hide();
        $(".nav-item.logged-in").css('display', 'inline-block').find(".username").text(user.username);
        $(".nav-item.logged-in").find(".avatar").attr('src', user.avatar);
        socket.emit('getUser', user.id);
    });
}

function nextState() {
    initState++;
    console.log("STATE: " + initState);
    if (initState === 2) {
        $("#loader").hide();
    }
}

function setWordsRemove() {
    $(".word-bubble .remove").click(function () {
        var word = $(this).data('word');
        $(this).closest('.word-bubble').remove();
        data.words.remove(word);
        $("#compose").prop('disabled', false).attr('placeholder', 'Enter your guesses');
        $("#limiter").text(data.words.length + "/" + config.maxWords);
        sendWords();
    });
}

function slugify(text) {
    return text.toString().toLowerCase()
        .replace(/\s+/g, '')           // Replace spaces with -
        .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
        .replace(/\-+/g, '')         // Replace multiple - with single -
        .replace(/^-+/, '')             // Trim - from start of text
        .replace(/-+$/, '');            // Trim - from end of text
}

(function (d, s, id) {
    var js, fjs = d.getElementsByTagName(s)[0];
    if (d.getElementById(id)) {
        return;
    }
    js = d.createElement(s);
    js.id = id;
    js.src = "https://connect.facebook.net/en_US/sdk.js";
    fjs.parentNode.insertBefore(js, fjs);
}(document, 'script', 'facebook-jssdk'));

function sendWords() {
    socket.emit('register', {name: user.username, session: user.id, guesses: data.words});
}

var leaderboardShown = false;

function showLeaderboard() {

    if(leaderboardShown){
        return;
    }
    leaderboardShown = true;

    var popular = {};

    for (var i = 0; i < userScores.length; i++) {
        var u = userScores[i];
        if (user && u.session === user.id) {
            $("#leaderboard-table tbody").append("<tr class='own-score'><td>" + (i + 1) + ".</td><td>" + u.name + "</td><td>" + u.score + "</td></tr>")
        } else if (i < 5) {
            $("#leaderboard-table tbody").append("<tr><td>" + (i + 1) + ".</td><td>" + u.name + "</td><td>" + u.score + "</td></tr>")
        }
        var guesses = u.guesses;
        for (var j = 0; j < guesses.length; j++) {
            if (guesses[j] in popular) {
                popular[guesses[j]] += u.guessesScore[j];
            } else {
                popular[guesses[j]] = u.guessesScore[j];
            }
        }
    }

    var sortable = [];
    for (var p in popular) {
        sortable.push([p, popular[p]]);
    }

    sortable.sort(function (a, b) {
        return b[1] - a[1];
    });

    for (i = 0; i < Math.min(3, sortable.length); i++) {
        if (sortable[i][1] > 0) {
            $(".popular-words").append("<div class='word-bubble'>" + sortable[i][0] + "<div class='score'>" + sortable[i][1] + "</div></div>");
        }
    }
    $("#leaderboard").show();
}