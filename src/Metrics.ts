import {getUserMetrics, initDB} from "./Database";

import * as chalk from "chalk";

async function init() {
    await initDB(false);
    await getUserMetrics();
}

init().then(() => {
    console.log(chalk.green.bold(`Metrics calculated successfully`));
    process.exit();
});
