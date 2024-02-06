# Brighton Explorers Club Signal groups automations

## Local development

Download and unpack Signal CLI 0.12.8 to this folder: https://github.com/AsamK/signal-cli/wiki/Quickstart

Login to Signal via CLI:

1. Open https://signalcaptchas.org/registration/generate.html and open the developer console's `Network` tab.
2. Complete the CAPTCHA and look for the `signalcaptcha://` failed redirect to get the CAPTCHA code.
3. `./signal-cli-0.12.8/bin/signal-cli -u +447XXXXXXXXX register --captcha CAPTCHA`
4. Wait for the SMS with the verification code
5. `./signal-cli-0.12.8/bin/signal-cli -u +447XXXXXXXXX verify CODE`
6. `./signal-cli-0.12.8/bin/signal-cli -u +447XXXXXXXXX receive`
7. `./signal-cli-0.12.8/bin/signal-cli -u +447XXXXXXXXX listGroups` should now show you a list of groups this user is a member of.

Run automations:

```shell
yarn
yarn build
SIGNAL_USER=+447XXXXXXXXX MYCLUBHOUSE_ACCESS_TOKEN=XXXXXXXXXX yarn start
```
