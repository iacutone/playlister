Playlists = new Mongo.Collection("playlists");
Songs = new Mongo.Collection("songs");

if (Meteor.isServer) {

  var key    = process.env.AWSAccessKeyId;
  var secret = process.env.AWSSecretKey;
  var bucket = process.env.AWSBucket;

  // Load future from fibers
  var Future = Npm.require("fibers/future");

  // Load exec
  var exec = Npm.require("child_process").exec;

  // Server methods
  Meteor.methods({
    getSong: function (artist, song) {

      // This method call won't return immediately, it will wait for the
      // asynchronous code to finish, so we call unblock to allow this client
      // to queue other method calls (see Meteor docs)
      this.unblock();
      var future = new Future();
      
      var searchString = `${artist + " " + song}`

      var song = exec("/Users/iacutone/code/fun/playlister/youtube.sh " + searchString, function(error, stdout, stderr) {
        console.log('stdout: ' + stdout);
        console.log('stderr: ' + stderr);
        if(error){
          console.log('error: ' + error);
        }
 
        future.return({stdout: stdout, stderr: stderr});
      });

      new FS.Store.S3("song", {
        accessKeyId: key, 
        secretAccessKey: secret, 
        bucket: bucket,
        transformWrite: function(fileObj, readStream, writeStream) {
          gm(readStream, fileObj.name()).stream().pipe(writeStream)
        }
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

      Songs.insert({
        artist: artist,
        song: song,
        userId: Meteor.user()._id,
        createdAt: new Date()
      });

      Meteor.call("getSong", artist, song, function(error, response) {
        if (error) {
          console.log(error);
        }

        debugger
        console.log(response)
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

    songSize: function () {
      var songs = Songs.find({userId: Meteor.user()._id}).fetch();

      return songs.length;
    },

    yourSongs: function () {
      return Songs.find({userId: Meteor.user()._id}).fetch();
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
    showForgotPasswordLink: false,
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
    privacyUrl: 'privacy',
    termsUrl: 'terms-of-use',

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
