"use strict";

const utils = require("@iobroker/adapter-core");
const EtaClient = require("./lib/etaClient");
const { flattenMenu } = require("./lib/parser");

class MeinEta extends utils.Adapter {

    constructor(options) {
        super({
            ...options,
            name: "meineta"
        });

        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
    }

    async onReady() {

        try {

            if (!this.config.host) {
                this.log.error("Keine ETA IP konfiguriert");
                return;
            }

            this.client = new EtaClient(this.config.host, this.config.port);

            await this.createVarSet();
            await this.discoverMenu();

            this.subscribeStates("values.*");

            this.pollTimer = setInterval(() => {
                this.pollVars();
                this.pollErrors();
            }, this.config.pollInterval || 60000);

        } catch (error) {
            this.log.error(error);
        }

    }

    async createVarSet() {

        try {
            await this.client.put(`/user/vars/${this.config.varset}`);
        } catch (error) {
            this.log.debug("Varset existiert bereits");
        }

    }

    async discoverMenu() {

        try {

            const data = await this.client.get("/user/menu");

            const menu = data.eta.menu[0];

            const vars = flattenMenu(menu);

            for (const v of vars) {

                const addr = v.uri.replace(/\//g, "_");

                await this.setObjectNotExistsAsync(`values.${addr}`, {
                    type: "state",
                    common: {
                        name: v.name,
                        type: "number",
                        role: "value",
                        read: true,
                        write: true
                    },
                    native: {
                        uri: v.uri
                    }
                });

                const uri = v.uri.replace("/", "");

                await this.client.put(`/user/vars/${this.config.varset}/${uri}`);

            }

        } catch (error) {
            this.log.error(`Menu Discovery Fehler: ${error}`);
        }

    }

    async pollVars() {

        try {

            const data = await this.client.get(`/user/vars/${this.config.varset}`);

            if (!data.eta.vars) return;

            const vars = data.eta.vars[0].variable;

            for (const v of vars) {

                const uri = v.$.uri;

                const id = `values.${uri.replace(/\//g, "_")}`;

                const raw = parseFloat(v._);

                const scale = parseFloat(v.$.scaleFactor || 1);

                const val = raw / scale;

                await this.setStateAsync(id, val, true);

            }

        } catch (error) {
            this.log.error(`Polling Fehler: ${error}`);
        }

    }

    async pollErrors() {

        try {

            const data = await this.client.get("/user/errors");

            await this.setObjectNotExistsAsync("errors.raw", {
                type: "state",
                common: {
                    name: "Active Errors",
                    type: "string",
                    role: "json",
                    read: true,
                    write: false
                },
                native: {}
            });

            await this.setStateAsync("errors.raw", JSON.stringify(data), true);

        } catch (error) {
            this.log.error(`Error Polling Fehler: ${error}`);
        }

    }

    async onStateChange(id, state) {

        if (!state || state.ack) return;

        try {

            const obj = await this.getObjectAsync(id);

            if (!obj || !obj.native || !obj.native.uri) return;

            const uri = obj.native.uri;

            const raw = Math.round(state.val);

            await this.client.post(`/user/var${uri}`, `value=${raw}`);

        } catch (error) {
            this.log.error(`State Write Fehler: ${error}`);
        }

    }

}

if (require.main !== module) {
    module.exports = (options) => new MeinEta(options);
} else {
    new MeinEta();
}
