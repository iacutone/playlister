Playlists = new Mongo.Collection("playlists");
Songs = new Mongo.Collection("songs");

if (Meteor.isServer) {
  Sortable.collections = ['songs'];

  // Load future from fibers
  var Future = Npm.require("fibers/future");

  // Load exec
  var exec = Npm.require("child_process").exec;

  // Server methods
  Meteor.methods({
    postSong: function (userId, artist, song) {

      // This method call won't return immediately, it will wait for the
      // asynchronous code to finish, so we call unblock to allow this client
      // to queue other method calls (see Meteor docs)
      this.unblock();
      var future = new Future();
      
      var searchString = `${userId + " " + artist + " " + song}`

      exec("~/code/fun/playlister/youtube.sh ~/code/fun/playlister/" + searchString, function(error, stdout, stderr) {
        console.log('stdout: ' + stdout);
        console.log('stderr: ' + stderr);
        if (error) {
          console.log('error: ' + error);
        }
 
        future.return({stdout: stdout, stderr: stderr});
      });

      return future.wait();
    },

    postSongToS3: function (userId, directory, file) {

      this.unblock();
      var future = new Future();

      var searchString = `${userId + " " + directory + " " + file}`

      exec("~/code/fun/playlister/s3.sh " + searchString, function(error, stdout, stderr) {
        console.log('stdout: ' + stdout);
        console.log('stderr: ' + stderr);
        if (error) {
          console.log('error: ' + error);
        }
 
        future.return({stdout: stdout, stderr: stderr});
      });

      return future.wait();
    },

    getSong: function(userId, file) {
      var list;
      var key = process.env.AWSAccessKeyId;
      var secret = process.env.AWSSecretKey;
      var bucket = process.env.AWSBucket;

      AWS.config.update({
        accessKeyId: key,
        secretAccessKey: secret
      });

      s3 = new AWS.S3();

      var file = `${userId + "/" + file}`

      list = s3.listObjectsSync({
        Bucket: bucket,
        Prefix: file
      });

      ref = list.Contents;
      for (i = 0, len = ref.length; i < len; i++) {
        file = ref[i];
        var params = {Bucket: bucket, Key: file['Key']};
        var url = s3.getSignedUrl('getObject', params);
        return url;
      }
    }
  });
}

if (Meteor.isClient) {
  Meteor.subscribe("playlists");
  Meteor.subscribe("songs");
  Meteor.subscribe("users");

  Template.body.events({

    "submit .new-playlist": function (event) {
      // Prevent default browser form submit
      event.preventDefault();
 
      // Get value from form element
      var playlistName = event.target.text.value;

      // Insert a task into the collection
      Playlists.insert({
        name: playlistName,
        userId: Meteor.user()._id,
        userEmail: Meteor.user().emails[0].address,
        createdAt: new Date() // current time
      });

      var userId     = Meteor.user()._id;
      var playlistId = Playlists.findOne({userId: userId})._id
      Session.set('playlistId', playlistId);
 
      // Clear form
      event.target.text.value = "";
    },

    "submit .new-song": function (event) {
      event.preventDefault();

      var artist = event.target.text[0].value;
      var song   = event.target.text[1].value;
      var userId = Meteor.user()._id;
      var playlistId = Playlists.findOne({userId: userId})._id

      Songs.insert({
        artist: artist,
        song: song,
        userId: userId,
        playlistId: playlistId,
        createdAt: new Date(),
        order: Songs.find({userId: userId}).fetch().length + 1,
        file: '',
        uploaded: false
      });

      Meteor.call("postSong", userId, artist, song, function(error, response) {
        if (error) {
          console.log("error" + error);
        }

        console.log(response);

        if (response.stderr == "") {
          var responseError = '';
        } else if (responseError = response.stderr.match(/ERROR/) !== null) {
          var responseError = response.stderr.match(/ERROR/);
        } else {
          var responseError = '';
        }
        
        if (responseError.length > 0) {
          var userId = Meteor.user()._id;

          FlashMessages.sendError("Song not found.");
        } else {
          var string = response.stdout;
          var userId = Meteor.user()._id;

          var directory = string.match(/Users(.*)/)[0]
          var file      = directory.split("/").slice(-1)[0]

          songId = Songs.find({userId: userId}).fetch().pop()._id
          Songs.update(songId, {$set: {file: file}});

          Meteor.call("postSongToS3", userId, directory, file, function(error, response) {
            if (error) {
              console.log(error);
            }

            songId = Songs.find({userId: userId}).fetch().pop()._id
            Songs.update(songId, {$set: {uploaded: true}});
            console.log(response);
          });
        }
      });

      event.target.text[0].value = "";
      event.target.text[1].value = "";
    },

    "submit .play-song": function(event){
      event.preventDefault();

      Session.set('playOrPauseClass', "fa fa-pause");
      var sessionSongId = Session.get('songId');

      var songId = event.target.text.value;
      var song = Songs.findOne({_id: songId});
      var userId = song.userId;

      if (songId == sessionSongId) {
        var audioElement = document.getElementById(sessionSongId);
        audioElement.play();

        event.target.classList.remove("play-song");
        event.target.children[1].children[0].classList.remove("fa-play");
        event.target.classList.add("pause-song");
        event.target.children[1].children[0].classList.add("fa-pause");
      } else {

        if (sessionSongId !== undefined) {

          var audioElement = document.getElementById(sessionSongId);
          audioElement.pause();

          var iconTag = document.getElementsByClassName(sessionSongId)[0];
          iconTag.classList.add("play-song");
          iconTag.classList.remove("pause-song");
          iconTag.classList.add("fa-play");
          iconTag.classList.remove("fa-pause");
        }

        Session.set('song', song.song);
        Session.set('playlistId', song.playlistId);
        Session.set('songArtist', song.artist);
        Session.set('songId', song._id);

        var fileName = song.file;

        Meteor.call("getSong", userId, fileName, function(error, response) {
          var audioElement = document.getElementById(song._id);
          audioElement.setAttribute('src', response);
          audioElement.play();
        });

        event.target.classList.remove("play-song");
        event.target.children[1].children[0].classList.remove("fa-play");
        event.target.classList.add("pause-song");
        event.target.children[1].children[0].classList.add("fa-pause");
      }
    },

    "submit .pause-song": function(event){
      event.preventDefault();

      Session.set('playOrPauseClass', "fa fa-play");

      var songId = Session.get('songId');
      var song = Songs.findOne({_id: songId})

      var audioElement = document.getElementById(song._id);
      audioElement.pause();

      event.target.classList.add("play-song");
      event.target.classList.remove("pause-song");
      event.target.children[1].children[0].classList.add("fa-play");
      event.target.children[1].children[0].classList.remove("fa-pause");
    },

    "click .playlist":  function (event) {
      event.preventDefault();

      Session.set('playlistId', this._id);
      Session.set('playOrPauseClass', "fa fa-play");
    },

    "click .session-song": function (event) {
      event.preventDefault();

      var sessionSongId = Session.get('songId');

      if (sessionSongId !== undefined) {

        var iconTag = document.getElementsByClassName(sessionSongId)[0];
        var playOrPause = Session.get('playOrPauseClass');

        if (playOrPause == 'fa fa-pause') {
          Session.set('playOrPauseClass', "fa fa-play");
          var audioElement = document.getElementById(sessionSongId);
          audioElement.pause();

          event.target.classList.add("play-song");
          event.target.classList.remove("pause-song");

          iconTag.classList.add("play-song");
          iconTag.classList.remove("pause-song");
          iconTag.classList.add("fa-play");
          iconTag.classList.remove("fa-pause");
        } else {
          Session.set('playOrPauseClass', "fa fa-pause");
          var audioElement = document.getElementById(sessionSongId);
          audioElement.play();

          event.target.classList.remove("play-song");
          event.target.classList.add("pause-song");

          iconTag.classList.remove("play-song");
          iconTag.classList.add("pause-song");
          iconTag.classList.remove("fa-play");
          iconTag.classList.add("fa-pause");
        }
      }
    }
  });

  Template.body.helpers({
    playlistNotPresent: function () {
      var playlists = Playlists.find({userId: Meteor.user()._id}).fetch();

      if (playlists.length == 0) {
        return true;
      } else {
        return false;
      }
    },

    yourPlaylist: function () {
      var playlistId = Session.get('playlistId');
      var userPlaylistId = Playlists.findOne({userId: Meteor.user()._id})._id

      if (playlistId == userPlaylistId || playlistId == undefined) {
        return true;
      } else {
        return false;
      }
    },

    sondIdPresence: function () {
      var songId = Session.get('songId');
      if (songId !== undefined) {
        return true;
      } else {
        return false;
      }
    }
  });

  Template.playlist.helpers({
    songs: function () {
      var playlistId = Session.get('playlistId');

      if (playlistId == undefined) {
        var userPlaylistId = Playlists.findOne({userId: Meteor.user()._id})._id
        return Songs.find({playlistId: userPlaylistId}, { sort: { order: 1 } });
      } else {
        return Songs.find({playlistId: playlistId}, { sort: { order: 1 } });
      }
    },
    songsOptions: {
      sortField: 'order',  // defaults to 'order' anyway
      group: {
        name: 'songs',
        put: true
      },
      sort: true  // don't allow reordering the types, just the attributes below
    },

    // event handler for reordering attributes
    onSort: function (event) {
      console.log('Item %s went from #%d to #%d',
        event.data.name, event.oldIndex, event.newIndex
      );
    },

    playlistName: function () {
      var playlistId = Session.get('playlistId');

      if (playlistId !== undefined) {
        return Playlists.findOne({_id: playlistId}).name
      } else {
        return ""
      }
    }
  });

  Template.playlists.helpers({
    playlists: function () {
      return Playlists.find({})
    }
  });

  Template.playlists.events({
    "click .playlist": function (event) {

      var playlist = $(this)[0]
      Session.set('playlist', playlist._id);
    }
  });

  Template.sessionPlayer.helpers({
    songId: function() {
      return Session.get('songId');
    },

    formattedSong: function () {
      var name = Session.get('song');
      var artist = Session.get('songArtist');

      if (name == undefined || name == '') {
        return ''
      } else {
        return `Playing ${name} by ${artist}`
      }
    },

    playOrPauseClass: function () {
      var playOrPause = Session.get('playOrPauseClass');
      var songId = Session.get('songId');


      if (playOrPause == undefined) {
        return 'fa fa-play'
      } else {
        return playOrPause;
      }
    },

    songDuration: function () {
      var seconds = Session.get('songDuration');

      if (seconds !== undefined) {
        var date = new Date(null);
        date.setSeconds(seconds)
        return date.toISOString().substr(14, 5);
      } else {
        return ''
      }
    },

    songCurrentTime: function () {
      var seconds = Session.get('currentTime')

      if (seconds !== undefined) {
        var date = new Date(null);
        date.setSeconds(seconds)
        return date.toISOString().substr(14, 5);
      } else {
        return ''
      }
    },

    strokeDashoffset: function () {
      var duration = Session.get('songDuration');
      var currentTime = Session.get('currentTime');

      if (duration !== undefined && currentTime !== undefined) {
        var circleStroke = document.getElementById('circle-stroke');
        var r = circleStroke.getAttribute("r")
        var c = Math.PI*(r*2);

        percentComplete = ((duration - currentTime) / duration) * 100
        
        var pct = ((100-percentComplete)/100)*c;
        return pct;
      } else {
        return 0;
      }
    }
  });
  
  Template.sessionPlayer.events({
    "durationchange audio": function (event, template) {
      Session.set('songDuration', event.target.duration);
    },

    "play audio": function(event) {
      setInterval(function() {
        Session.set('currentTime', event.target.currentTime);
      }, 25)
    },

    "ended audio": function (event) {
      var playlistId = Session.get('playlistId');
      var sessionSongId = Session.get('songId');
      var iconTag = document.getElementsByClassName(sessionSongId)[0];

      iconTag.classList.add("play-song");
      iconTag.classList.remove("pause-song");
      iconTag.classList.add("fa-play");
      iconTag.classList.remove("fa-pause");

      // find the next song to play

      var song = Songs.findOne({_id: sessionSongId})
      var order = song.order

      var songs = Songs.find({playlistId: playlistId, uploaded: true}).fetch()
      var songsIdArray = []

      for (i = 0, len = songs.length; i < len; i++) {
        if (songs[i].order > order) {
          songsIdArray.push(songs[i]._id)
        }
      }

      // play the next song

      if (songsIdArray.length > 0) {
        var song = Songs.findOne({_id: songsIdArray[0]})
        Session.set('song', song.song);
        Session.set('playlistId', song.playlistId);
        Session.set('songArtist', song.artist);
        Session.set('songId', song._id);

        var fileName = song.file;
        var userId = song.userId;

        Meteor.call("getSong", userId, fileName, function(error, response) {
          var audioElement = document.getElementById(song._id);
          audioElement.setAttribute('src', response);
          audioElement.play();
        });

        var iconTag = document.getElementsByClassName(song._id)[0];
        iconTag.classList.remove("play-song");
        iconTag.classList.add("pause-song");
        iconTag.classList.remove("fa-play");
        iconTag.classList.add("fa-pause");
      }
    }
  });

  AccountsTemplates.configure({
    // Behavior
    confirmPassword: true,
    enablePasswordChange: true,
    forbidClientAccountCreation: false,
    overrideLoginErrors: true,
    sendVerificationEmail: false,
    lowercaseUsername: false,
    focusFirstInput: true,

    // Appearance
    showAddRemoveServices: false,
    showForgotPasswordLink: true,
    showLabels: true,
    showPlaceholders: true,
    showResendVerificationEmailLink: false,

    // Client-side Validation
    continuousValidation: false,
    negativeFeedback: false,
    negativeValidation: true,
    positiveValidation: true,
    positiveFeedback: true,
    showValidating: true,

    // Privacy Policy and Terms of Use
    // privacyUrl: 'privacy',
    // termsUrl: 'terms-of-use',

    // Redirects
    homeRoutePath: '/',
    redirectTimeout: 4000,

    // Hooks
    // onLogoutHook: myLogoutFunc,
    // onSubmitHook: mySubmitFunc,
    // preSignUpHook: myPreSubmitFunc,
    // postSignUpHook: myPostSubmitFunc,

    // Texts
    texts: {
      button: {
        signUp: "Register Now!"
      },
      socialSignUp: "Register",
      socialIcons: {
        "meteor-developer": "fa fa-rocket"
      },
      title: {
        forgotPwd: "Recover Your Password"
      },
    },
  });
}
