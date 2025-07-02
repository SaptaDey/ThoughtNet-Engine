"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const config_1 = require("./config");
const app = (0, app_1.createApp)();
const { host, port } = config_1.settings.app;
app.listen(port, host, () => {
    console.log(`Server is running on http://${host}:${port}`);
});
