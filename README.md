# Worker Report

This tool will reach out to a list of domains and collect information about the specific worker file.

## Workflow

You'll need to have [node (nodejs)](https://nodejs.org/en/download/) installed on your computer. Node runs the JS (Javascript) code in this repository [source]().

0. If you are on Windows: install Git: https://git-scm.com/download/win
1. Clone this repository: 
`git clone https://github.com/gregwhitman/worker-file-checks.git`
2. Install dependencies: enter the cloned folder (on the commandline) using `cd worker-file-checks` and run:
`npm install`
3. Fetch a specific worker file information into a local `json` file

## Syntax

### Fetch worker file information into .json file

Run the code to collect all worker file data:

```
npm run start
```

Modify package.json "start" script to add/remove variables.

Must include --path variable. --path is the path to the worker file on domain. EX: "/aimtell-worker.js"

If you want to fetch a worker file, append the worker path:

```
npm start --path=/aimtell-worker.js
```

Additional options...
--filename "custom name to name the file outputed" EX: "--filename=custom_filename.json"
--report_type "what information to include in .json file" (full,issues,no_issues) EX:"--report_type=issues"

npm start "--path=/aimtell-worker.js --report_type=full --filename=custom_filename.json
```

**The tool will save the worker information in `./<filename>.json`.
