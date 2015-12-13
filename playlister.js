Playlists = new Mongo.Collection("playlists");
Songs = new Mongo.Collection("songs");

if (Meteor.isClient) {

  var key = process.env.AWSAccessKeyId;
  var secret = process.env.AWSSecretKey;
  var bucket = process.env.AWSBucket;

  S3.config = {
    key: key,
    secret: secret,
    bucket: bucket
  };

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
