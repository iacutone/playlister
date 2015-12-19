Playlists = new Mongo.Collection("playlists");
Songs = new Mongo.Collection("songs");

if (Meteor.isServer) {
  Sortable.collections = ['songs'];

  var key    = process.env.AWSAccessKeyId;
  var secret = process.env.AWSSecretKey;
  var bucket = process.env.AWSBucket;

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
        if(error){
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
        if(error){
          console.log('error: ' + error);
        }
 
        future.return({stdout: stdout, stderr: stderr});
      });

      return future.wait();
    }
  });
}

if (Meteor.isClient) {
  Meteor.subscribe("playlists");
  Meteor.subscribe("songs");

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
          console.log(error);
        }

        console.log(response);
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
      });

      event.target.text[0].value = "";
      event.target.text[1].value = "";
    }
  });

  Template.body.helpers({
    playlistNotPresent: function () {
      var playlists = Playlists.find({userId: Meteor.user()._id}).fetch();

      if(playlists.length == 0) {
        return true;
      } else {
        return false;
      }
    },

    playlistPresent: function () {
      var playlists = Playlists.find({userId: Meteor.user()._id}).fetch();
      
      if(playlists.length > 0) {
        return true;
      } else {
        return false;
      }
    },

    playlistName: function () {
      return Playlists.findOne({userId: Meteor.user()._id}).name
    },

    songSize: function () {
      var songs = Songs.find({userId: Meteor.user()._id}).fetch();

      return songs.length;
    }
  });

  Template.songs.helpers({
    yourSongs: function () {
      return Songs.find({userId: Meteor.user()._id}, { sort: { order: 1 } });
    },
    songsOptions: {
      sortField: 'order',  // defaults to 'order' anyway
      group: {
        name: 'songs',
        put: true
      },
      sort: true  // don't allow reordering the types, just the attributes below
    },

    // // event handler for reordering attributes
    onSort: function (event) {
      console.log('Item %s went from #%d to #%d',
        event.data.name, event.oldIndex, event.newIndex
      );
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
