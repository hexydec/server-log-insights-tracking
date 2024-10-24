# Server Log Insights Tracking Code

This repository provides tracking code for [Server Log Insights](https://serverloginsights.com), a server logs analytics tool.

## Usage

Add this repository as a dependency in your `package.json` file using NPM:

```
npm i --save hexydec/server-log-insights-tracking#main
```

You can build the tracking into your javascript bundle like this:

```javascript
import tracking from "../node_modules/server-log-insights-tracking/src/tracking.js";

document.addEventListener("DOMContentLoaded", () => {
	tracking();
});
```

You can also update the base address of the tracking endpoint like this:

```javascript
tracking("/the-base-address-of-my-website/");
```

The tracking code uses the endpoint [`/slid.json`](src/slid.json). The endpoint doesn't have to exist for the system to pick up the data in your server logs, but it is better to place the file in your root directory so that your logs are not filled with 404 errors.

## Licence

The MIT License (MIT). Please see [License File](LICENCE) for more information.