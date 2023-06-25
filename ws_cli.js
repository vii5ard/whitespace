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

  let buffer = Buffer.from([]);
  let atEof = false;

  process.stdin.once('close', function (hadError) {
    atEof = true;
    continueRun();
  });

  env.print = function (val) {
    process.stdout.write(val.toString());
  };

  const read = function () {
    if (atEof) {
      if (buffer.length !== 0) {
        throw 'Invalid UTF-8 sequence';
      }
      throw 'Read at EOF';
    }
    process.stdin.once('data', function (data) {
      if (env.running) {
        buffer = Buffer.concat([buffer, data]);
        continueRun();
      }
    });
    throw 'IOWait';
  };

  env.readChar = function () {
    if (buffer.length !== 0) {
      // Decode the first UTF-8 codepoint from the buffer (at most 4 bytes)
      const utf8Prefix = buffer.toString('utf8', 0, 4);
      const codepoint = utf8Prefix.codePointAt(0);
      const charBuffer = Buffer.from([...utf8Prefix][0], 'utf8');

      // Any invalid sequences are replaced with � U+FFFD. Check that the buffer
      // doesn't have a literal �.
      const errBuffer = Buffer.from('�', 'utf8');
      if (codepoint === 0xfffd &&
          Buffer.compare(buffer.subarray(0, errBuffer.length), errBuffer) !== 0) {
        if (buffer.length > charBuffer.length) {
          throw 'Invalid UTF-8 sequence';
        }
        // More bytes need to be read for a valid codepoint
      } else {
        buffer = buffer.subarray(charBuffer.length);
        return codepoint;
      }
    }
    read();
  };

  env.readNum = function () {
    const i = buffer.indexOf('\n');
    if (i >= 0) {
      const line = buffer.subarray(0, i).toString('utf8');
      buffer = buffer.subarray(i + 1);
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
