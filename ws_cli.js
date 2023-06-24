#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const process = require('process');

const abort = function (err, code) {
  process.stderr.write(err + '\n');
  process.exit(code);
};

const usage = `Usage: ws_cli.js [options] [--] <file>

Modes:
  --run, -r      Interpret the program (default)
  --ws, -w       Dump the program as Whitespace
  --wsa, -a      Dump the program as Whitespace assembly

Options:
  --opt, -o      Optimize the program
  --verbose, -v  Use verbose output
  --help, -h     Print help`;

let filename = null;
let mode = null;
let optimize = false;
let verbose = false;

const setMode = function (newMode) {
  if (mode != null && newMode !== mode) {
    abort(`Usage error: Mode '${mode}' is mutually exclusive with '${newMode}'`, 2);
  }
  mode = newMode;
};

for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  // Long options
  if (arg === '--run') {
    setMode('run');
  } else if (arg === '--ws') {
    setMode('ws');
  } else if (arg === '--wsa') {
    setMode('wsa');
  } else if (arg === '--opt') {
    optimize = true;
  } else if (arg === '--verbose') {
    verbose = true;
  } else if (arg === '--help') {
    abort(usage);
  } else if (arg === '--') {
    if (filename != null) {
      abort('Usage error: Too many arguments', 2);
    }
    filename = process.argv[i + 1];
    break;
  } else if (arg.startsWith('--')) {
    abort(`Usage error: Unknown option: '${arg}'`, 2);
  } else if (arg.startsWith('-')) {
    // Short options
    for (const opt of arg.slice(1)) {
      if (opt === 'r') {
        setMode('run');
      } else if (opt === 'w') {
        setMode('ws');
      } else if (opt === 'a') {
        setMode('wsa');
      } else if (opt === 'o') {
        optimize = true;
      } else if (opt === 'v') {
        verbose = true;
      } else if (opt === 'h') {
        abort(usage);
      } else {
        abort(`Usage error: Unknown option: '-${opt}'`, 2);
      }
    }
  } else {
    if (filename != null) {
      abort('Usage error: Too many arguments', 2);
    }
    filename = arg;
  }
}

if (filename == null) {
  if (process.argv.length > 2) {
    abort('Usage error: No filename given', 2);
  } else {
    abort(usage, 2);
  }
}
if (mode == null) {
  mode = 'run';
}
if (!verbose) {
  console.log = function () {};
  console.warn = function () {};
  console.error = function () {};
}

const libRoot = path.join(__dirname, 'example');
const localRoot = process.cwd();

// Provide a minimal ws_fs with only what's needed for ws_asm.
globalThis.ws_fs = (function () {
  const self = {
    files: {},
    getFile: function (filename) {
      if (!self.files[filename]) {
        let src;
        try {
          src = fs.readFileSync(path.join(localRoot, filename), 'utf8');
        } catch (err1) {
          try {
            src = fs.readFileSync(path.join(libRoot, filename), 'utf8');
          } catch (err2) {
            return null;
          }
        }
        self.files[filename] = { src: src };
      }
      return self.files[filename];
    },
    openFile: function (file) {
      return file.src;
    }
  };
  return self;
})();

require('./ws_util.js');
require('./ws_core.js');
require('./ws_asm.js');
require('./ws_opt.js');

let compile;
if (/\.ws$/i.test(filename)) {
  compile = ws.compile;
} else if (/\.wsa$/i.test(filename)) {
  compile = ws_asm.compile;
} else {
  abort(`Error: Extension must be '.ws' or '.wsa'`, 2);
}

let src;
try {
  src = fs.readFileSync(filename, 'utf8');
} catch (err) {
  abort(`Error: No such file: '${filename}'`, 2);
}

let program;
try {
  program = compile(src);
} catch (err) {
  abort(`Compile error: ${err.message || err}`, 1);
}
if (optimize) {
  program = ws_opt.optimize(program);
}

const run = function (program) {
  const env = ws.env();

  let buffer = '';
  process.stdin.setEncoding('utf8');

  const continueRun = function () {
    try {
      env.runProgram(program);
      // Exit, so that it doesn't wait for stdin
      process.exit();
    } catch (err) {
      if (err === 'IOWait') {
        // Do nothing; continueRun will be called when IO is ready
      } else {
        abort(`Runtime error: ${err}`, 1);
      }
    }
  };

  env.print = function (val) {
    process.stdout.write(val.toString());
  };

  const read = function () {
    process.stdin.once('data', function (data) {
      if (env.running) {
        buffer += data.toString('utf8');
        continueRun();
      }
    });
    throw 'IOWait';
  };

  env.readChar = function () {
    if (buffer !== '') {
      const ch = Array.from(buffer)[0];
      const codepoint = buffer.codePointAt(0);
      if (codepoint == null || 0xd800 <= codepoint && codepoint <= 0xdfff) {
        if (buffer.length > ch.length) {
          throw 'Invalid UTF-8 byte sequence';
        }
        // Read other surrogate half
      } else {
        buffer = buffer.slice(ch.length);
        return ch;
      }
    }
    read();
  };

  env.readNum = function () {
    const i = buffer.indexOf('\n');
    if (i >= 0) {
      const line = buffer.slice(0, i);
      buffer = buffer.slice(i + 1);
      try {
        return BigInt(line);
      } catch (err) {
        throw `Invalid number format: ${line.trim()}`;
      }
    }
    read();
  };

  continueRun();
};

if (mode === 'run') {
  run(program);
} else if (mode === 'ws') {
  process.stdout.write(program.getWsSrc());
} else if (mode === 'wsa') {
  for (const instr of program.getAsmSrc()) {
    let str = instr.str;
    // Do not indent labels
    if (instr.IP != null) {
      str = '  ' + instr.str;
    }
    process.stdout.write(str + '\n');
  }
}
