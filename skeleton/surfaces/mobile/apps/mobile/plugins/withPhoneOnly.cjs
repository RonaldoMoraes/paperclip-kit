const { withAndroidManifest } = require("expo/config-plugins");

// Phones only. Play filters an app out of a tablet's store by this element; iOS does
// the same through `UIRequiredDeviceCapabilities` in app.config.js.
module.exports = function withPhoneOnly(config) {
  return withAndroidManifest(config, (mod) => {
    mod.modResults.manifest["supports-screens"] = [
      {
        $: {
          "android:smallScreens": "true",
          "android:normalScreens": "true",
          "android:largeScreens": "false",
          "android:xlargeScreens": "false",
        },
      },
    ];
    return mod;
  });
};
