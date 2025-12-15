const child_process = require('child_process');

child_process.exec('whoami', (error, stdout, stderr) => {
    if (error) {
        console.error(`Error executing command: ${error}`);
        return;
    }
    if (stderr) {
        console.error(`Error output: ${stderr}`);
        return;
    }
    console.log(`Current user: ${stdout.trim()}`);
});