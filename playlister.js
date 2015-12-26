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
    getSong: function (userId, artist, song) {

      // This method call won't return immediately, it will wait for the
      // asynchronous code to finish, so we call unblock to allow this client
      // to queue other method calls (see Meteor docs)
      this.unblock();
      var future = new Future();
      
      var searchString = `${userId + " " + artist + " " + song}`

      exec("/Users/iacutone/code/fun/playlister/youtube.sh " + searchString, function(error, stdout, stderr) {
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

      exec("/Users/iacutone/code/fun/playlister/s3.sh " + searchString, function(error, stdout, stderr) {
        console.log('stdout: ' + stdout);
        console.log('stderr: ' + stderr);
        if (error) {
          console.log('error: ' + error);
        }
 
        future.return({stdout: stdout, stderr: stderr});
      });

      return future.wait();
    },

    getSongs: function(userId) {
      var list;
      var key = process.env.AWSAccessKeyId;
      var secret = process.env.AWSSecretKey;
      var bucket = process.env.AWSBucket;

      AWS.config.update({
        accessKeyId: key,
        secretAccessKey: secret
      });

      s3 = new AWS.S3();

      list = s3.listObjectsSync({
        Bucket: bucket,
        Prefix: userId
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

      Meteor.call("getSong", userId, artist, song, function(error, response) {
        if (error) {
          console.log("error" + error);
        }

        console.log(response);
        
        var responseError = response.stderr.match(/ERROR/);

        if (responseError.length > 0) {
          var userId = Meteor.user()._id;
          var songId = Songs.find({userId: userId}).fetch().pop()._id
          Songs.remove(songId);

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

      var userId = Meteor.user()._id;
      var songId = event.target.text.value
      var song = Songs.findOne({_id: songId})

      Session.set('songSong', song.song);
      Session.set('songArtist', song.artist);
      Session.set('songId', song._id);

      Meteor.call("getSongs", userId, function(error, response) {
        var audioElement = document.getElementById(song.id);
        audioElement.setAttribute('src', response);
        audioElement.play();
      });
    },

    "submit .pause-song": function(event){
      event.preventDefault();
      var userId = Meteor.user()._id;
      var songId = Session.get('songId');
      
      var audioElement = document.getElementById(song.id);
      audioElement.pause();
    },

    "submit .stop-song": function(event){
      event.preventDefault();
      var userId = Meteor.user()._id;
      var songId = Session.get('songId');

      var audioElement = document.getElementById(song.id);
      audioElement.pause();

      Session.set('songSong', "");
      Session.set('songArtist', "");
      Session.set('_id', "");
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
      var playlistId = Session.get('playlistId')

      return Playlists.findOne({playlistId: playlistId}).name
    }
  });

  Template.playlists.helpers({
    playlists: function () {
      return Playlists.find({})
    },

    userEmail: function () {
      return Meteor.user().emails[0].address
    }
  });

  Template.playlists.events({
    "click .playlist": function (event) {

      var playlist = $(this)[0]
      Session.set('playlist', playlist._id);
    }
  });

  Template.sessionPlayer.helpers({
    formattedSong: function () {
      var name = Session.get('songSong');
      var artist = Session.get('songArtist');

      if (name == undefined || name == '') {
        return ''
      } else {
        return `Playing ${name} by ${artist}`
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
