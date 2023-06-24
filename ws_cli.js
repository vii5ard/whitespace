const fs = require("fs");
const path = require("path");
const process = require("process");

const libRoot = path.join(__dirname, "example");
const localRoot = process.cwd();

const abort = function (err, code) {
  process.stderr.write("Error: " + err + "\n");
  process.exit(code);
};

// Provide a minimal ws_fs with only what's needed for ws_asm.
globalThis.ws_fs = (function () {
  const self = {
    files: {},
    getFile: function (fileName) {
      if (!self.files[fileName]) {
        let src;
        try {
          src = fs.readFileSync(path.join(localRoot, fileName), "utf8");
        } catch (err1) {
          try {
            src = fs.readFileSync(path.join(libRoot, fileName), "utf8");
          } catch (err2) {
            const libRelative = path.relative(localRoot, libRoot);
            abort("no such file '" + fileName + "' in '.' or '" + libRelative + "'", 1);
          }
        }
        self.files[fileName] = { src: src };
      }
      return self.files[fileName];
    },
    openFile: function (file) {
      return file.src;
    }
  };
  return self;
})();

require("./ws_util.js");
require("./ws_core.js");
require("./ws_asm.js");

if (process.argv.length !== 3) {
  abort("Usage: ws_cli.js <file>", 2);
}
const fileName = process.argv[2];

let compile;
if (/\.ws$/i.test(fileName)) {
  compile = ws.compile;
} else if (/\.wsa$/i.test(fileName)) {
  compile = ws_asm.compile;
} else {
  abort("extension must be '.ws' or '.wsa'", 2);
}

let src;
try {
  src = fs.readFileSync(fileName, "utf8");
} catch (err) {
  abort("no such file '" + fileName + "'", 2);
}
const program = compile(src);
process.stdout.write(program.getWsSrc());
