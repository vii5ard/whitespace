const logger = (function () {
  const writeTab = function (msg, level) {
    const consoleArea = $('#consoleArea');
    consoleArea.append('<div>' + (level ? level + ': ' : '') + msg + '<div>');
    consoleArea.scrollTop(consoleArea[0].scrollHeight);

    const tabLabel = $('#tabLabelConsole');
    if (!tabLabel.is('.activeTab')) {
      tabLabel.addClass('emph');
    }
  };
  return {
    log: writeTab,
    info: function (msg) {
      writeTab(msg, "INFO");
    },
    error: function (msg) {
      writeTab(msg, "ERROR");
    },
    warn: function (msg) {
      writeTab(msg, "WARNING");
    }
  };
})();

globalThis.ws_ide = (function () {
  const updateOverlay = function () {
    const srcInput = $('#srcInput');
    const srcOverlay = $('#srcOverlay');
    const src = srcInput.val();
    let overlay = '';
    if (ws_ide.highlightEnabled && ws_ide.openFile) {
      overlay = ws_ide.highlightSourceWs(src);
    }
    srcOverlay.html(overlay);

    const pre = $('#srcHiddenDiv');
    pre.text(src);

    srcInput.width(pre.width() + 30);
    srcInput.height(pre.height() + 30);
    $('#inputContainer').height(srcInput.height());
  };

  const getExtension = function (fn) {
    return fn.replace(/.*\.([^.]+)$/, '$1');
  };

  getExecPath = function(fn, vms) {
    if (typeof vms === 'undefined') {
      vms = ws_fs.getFileNames(/^vm\//);
    }

    const ext = getExtension(fn);

    for (let i = 0; i < vms.length; i++) {
      if (new RegExp('^vm/' + ext + '\\..*').test(vms[i])) {
        const vmExt = getExtension(vms[i]);
        if (vmExt === 'ws' || vmExt === 'wsa') {
          return [vms[i]];
        } else {
          const subPath = getExecPath(vms[i], vms.slice(0, i).concat(vms.slice(i + 1)));
          if (subPath.length > 0) {
            return subPath.concat([vms[i]]);
          }
        }
      }
    }
    return [];
  }

  getCompilePath = function(fn, wcs) {
    if (typeof wcs === 'undefined') {
      wcs = ws_fs.getFileNames(/^wc\/.*\.wsa?$/);
    }

    const ext = getExtension(fn);

    for (let i = 0; i < wcs.length; i++) {
      const expr = /^wc\/([^2]+)2(.+)\.wsa?$/;
      if (!expr.test(wcs[i])) continue;
      const e = {file: wcs[i]};

      e.from = e.file.replace(expr, '$1');

      if (e.from !== ext) continue;

      e.to = e.file.replace(expr, '$2');

      if (/^wsa?$/.test(e.to)) return [e];
      const subPath = getCompilePath(e.to, wcs.slice(0, i).concat(wcs.slice(i + 1)));
      if (subPath.length > 0) return subPath.concat([e]);
    }
    return [];
  }

  const compileProgram = function (showPath) {
    const disasm = $('#disasm');
    disasm.html('');

    const openFile = ws_ide.openFile;
    const ext = getExtension(openFile.name);

    if (!/^wsa?$/i.test(ext)) return;

    const src = programSource();
    const errorDiv = $('#errorDiv');
    errorDiv.html('&nbsp;');
    try {
      if (/^ws$/i.test(ext)) {
        ws_ide.program = ws.compile(src);
      } else if (/^wsa$/i.test(ext)) {
        ws_ide.program = ws_asm.compile(src);
      } else {
        errorDiv.text("Unable to compile file with the extension.");
      }
      delete ws_ide.program.compileError;
    } catch (err) {
      if (ws_ide.program) {
        ws_ide.program.compileError = "Unknown compile error";
      }
      errorDiv.text(err.message);
      return;
    }

    if (/^wsa?$/i.test(ext)) {
      const disasmSrc = ws_ide.program.getAsmSrc();
      for (const ln of disasmSrc) {
        const div = $('<div class="asmLine"></div>');
        div.text(ln.str);

        if (ln.IP != null) {
          div.addClass('asmInstr');
          div.attr('id', 'instr_' + ln.IP);

          if (ws_ide.openFile.breakpoints && ln.IP in ws_ide.openFile.breakpoints) {
            div.addClass('breakpoint');
          }

          div.click((function (ip) {
            return function () {
              ws_ide.toggleBreakpoint(ip);
            }
          })(ln.IP));
        } else {
          div.addClass('asmLabel');
        }
        div.appendTo(disasm);
      }
      ws_ide.openFile.breakpoints = ws_ide.openFile.breakpoints || {}
    }
  };

  const updateEditorFileName = function (file) {
    let prefix = '';
    file = file || ws_ide.openFile;

    if (!file.extFile) prefix = '(Local Storage) '
    if (file.changed) prefix += '*';

    $('#panelMiddleLabel span').text(prefix + file.name);
  };

  const updateEditor = function (evt) {
    updateOverlay();

    compileProgram();

    updateEditorFileName();
  };

  const programSource = function (src) {
    const srcInput = $('#srcInput');
    if (typeof src === "undefined") {
      return srcInput.val();
    } else {
      const ret = ws_ide.loadSource(src);
      updateEditor();
      return ret;
    }
  };

  const resizeUserInput = function() {
    const input = $('#userInput');
    const form = input.closest('form');
    const container = form.parent();
    input.width(0);
    input.width(container.width() - (input.position().left - container.position().left));
  }

  const printOutput = function(str) {
    if (typeof str !== "string") {
      str = "" + str;
    }
    const printArea = $('#printArea');
    const arr = str.split('\n');
    let last = printArea.find('span:last');
    for (let i = 0; i < arr.length; i++) {
      const ln = arr[i];
      if (i !== 0) {
        last.after('<br><span style="display:inline-block; min-height:13px" autocomplete="off"></span>');
        last = printArea.find('span:last');
      }
      last.html(last.html() + ln);
    }
    let outputArea = printArea.closest('.outputArea');
    outputArea.scrollTop(outputArea[0].scrollHeight);

    const tabLabel = $('#tabLabelPrint');
    if (!tabLabel.is('.activeTab')) {
      tabLabel.addClass('emph');
    }
    resizeUserInput();
  };

  const readChar = function() {
    if (ws_ide.inputStream.length > 0) {
      return ws_ide.inputStream.shift();
    } else {
      ws_ide.focusUserInput('#userInput');
      throw "IOWait";
    }
  }

  const readNum = function() {
    let numStr = "";
    while (true) {
      const ch = readChar();
      if (ch === '\n') break;
      numStr += ch;
    }
    try {
      return BigInt(numStr);
    } catch (e) {
      throw "Illegal number entered!";
    }
  };

  const updateMemoryTab = function (env) {
    if (!$('#memoryArea').is(':visible') || !env) return;

    $('#stackSpan').html('[' + env.stack.slice(0,env.register.SP).join(', ') + ']');
    const heapArr = [];
    const heap = env.heap.toArray();
    for (const i in heap) {
      heapArr.push(i + ':' + heap[i]);
    }
    $('#heapSpan').html('{\t' + heapArr.join(',\t') + '}');
  }

  const afterInstructionRun = function(env) {
    env.runCount++;
    const now = Date.now();
    if (!env.lastSleep || (now - env.lastSleep > 300)) {
      env.lastSleep = now;
      throw "SLEEP";
    }
    if (env.debug) {
      updateMemoryTab(env);
    }
  };
  const updateFileList = function () {
    const fileList = $('#fileList');
    fileList.find('.fileEntry').remove();
    const sortedFileNames = ws_fs.getFileNames();

    let id = 0;
    for (const fileName of sortedFileNames) {
      ++id;
      const file = ws_fs.getFile(fileName);
      const line = $('<div id="file_' + id + '" title="' + fileName + '"></div>');
      line.addClass('fileEntry');
      const link = $('<div><div class="ico"></div></div>');
      const form = $('<form onsubmit="return false;"></form>');
      const inp = $('<input type="text" class="userInput"></input>');
      const nameChange = (function (fileName, id) {
        return function () {
          ws_ide.handleFileRename(fileName, id);
        };
      })(fileName, id);
      inp.change(nameChange);
      inp.val(file.name);
      inp.appendTo(form);

      form.appendTo(link);
      link.appendTo(line);

      line.on('click', (function(fileName) {
        return function(event) {
          ws_ide.loadFile(fileName);
          $(this).find('input').focus().select();
        }
      })(fileName));

      line.appendTo(fileList);
    }
  };

  const storeSource = function () {
    const file = ws_ide.openFile;
    if (!file) return;
    const prog = programSource();
    if (file.changed) {
      file.extFile = false;
      updateEditorFileName();
    }
    file.src = prog;
  };

  const programRunnable = function() {
    const ext = getExtension(ws_ide.openFile.name);
    if (/^wsa?$/i.test(ext)) return true;
    return ws_ide.getExecPath(ws_ide.openFile.name).length > 0;
  }

  const programCompilable = function() {
    const ext = getExtension(ws_ide.openFile.name);
    if (/^wsa$/i.test(ext)) return true;
    return getCompilePath(ext).length > 0;
  }

  const programOptimizable = function() {
    const ext = getExtension(ws_ide.openFile.name);
    return /^ws$/i.test(ext);
  }

  const showLang = function() {
    if (programRunnable()) {
      $('#btnRun').show();
    } else {
      $('#btnRun').hide();
    }

    if (programCompilable()) {
      $('#btnCompile').show();
    } else {
      $('#btnCompile').hide();
    }

    if (programOptimizable()) {
      $('#btnOptimize').show();
    } else {
      $('#btnOptimize').hide();
    }
  };

  const beforeInstructionRun = function (env) {
    if (!env.debug || !env.running) return;

    $('#disasm .running').removeClass('running');
    const instLine = $('#disasm #instr_' + env.register.IP);
    const scroller = instLine.closest(".content");

    if (instLine.length === 0) return;

    // Scroll to view
    if ((instLine.offset().top + instLine.height()) > scroller.offset().top + scroller.height() || instLine.offset().top < scroller.offset().top) {
      scroller.animate({scrollTop: (scroller.scrollTop() + instLine.offset().top - scroller.height() / 2) + "px"}, 0);
    }

    instLine.addClass('running');

    if (env.continueDebug) {
      env.continueDebug = false;
    } else if (env.stepProgram) {
      env.stepProgram = false;
      throw "Break";
    } else if (env.debug && env.register.IP in ws_ide.openFile.breakpoints) {
      throw "Break";
    }
  };

  const cleanupDebug = function () {
    $('.asmline.running').removeClass('unning');
  };

  const createNewFile = function (fileName) {
    if (!fileName) {
      fileName = 'New file ';
      let count = 1;
      while (true) {
        const fn = fileName + count + '.ws';
        if (!(fn in ws_fs.files)) {
          fileName = fn;
          break;
        }
        count++;
      }
    }
    const file = {
      name: fileName,
      file: "<localStorage>",
      src: "",
      localStorage: true,
      changed: false
    };
    ws_fs.saveFile(file);

    return fileName;
  };

  const getProgramStat = function (src) {
    const size = src.length;
    const prog = ws.compile(src);
    const instCount = prog.programStack.length;
    return {
      size: size,
      instCount: instCount
    };
  };

  const self = {
    files: {},
    inputStream: [],
    animator: 0,
//    animation: ['-', '\\', '|', '/'],
    animation: ['.oO0 ', ' .oO0', '  .o0', '   .0', '    0', '   0O', '  00o', ' 0Oo.', '0Oo. ', '0o.  ', '0.   ', '0    ', 'O0   ', 'oO0  ',],
    defaultFile: [],
    highlightSourceWs: function (src) {
      return src.replace(/[^\t\n ]/g, '#')
          .replace(/([ ]+)/g, '<span class="spaces">\$1</span>')
          .replace(/(\t+)/g, '<span class="tabs">\$1</span>')
          .replace(/#/g, ' ');
    },

    init: function () {
      const input = $('#srcInput');
      input.bind("input paste keyup", function () {
        ws_ide.openFile.src = this.value;
        ws_ide.openFile.changed = true;
        updateEditor();
      });
      input.bind("propretychange", updateEditor);

      input.keydown(function (e) {
        return interceptTabs(e, this);
      });

      updateFileList();

      ws_ide.loadFile("hworld.ws");

      ws_ide.initEnv();
      ws_ide.switchTab('a[href="#printTab"]');

      ws_ide.displayModal('#splashScreenModal');
      ws_ide.updateSnake();
    },

    initEnv: function () {
      const env = ws.env();
      env.print = printOutput;
      env.readChar = readChar;
      env.readNum = readNum;
      env.afterInstructionRun = afterInstructionRun;
      env.beforeInstructionRun = beforeInstructionRun;
      ws_ide.env = env;
      return env;
    },

    loadSource: function (src) {
      const ret = $('#srcInput').val(src);
      updateEditor();
      return ret;
    },

    loadFile: function (fileName) {
      $('#fileList .fileEntry.emph').removeClass('emph');
      $('div.fileEntry input').filter(
          function () {
            return $(this).val() === fileName;
          }
      ).parents('div.fileEntry').addClass('emph');

      if (ws_ide.openFile && ws_ide.openFile.name === fileName) return;

      ws_ide.stopProgram();

      storeSource();
      const file = ws_fs.getFile(fileName);
      if (!file) return;

      if (ws_ide.openFile) {
        if (ws_ide.defaultFile[ws_ide.defaultFile.length - 1] !== ws_ide.openFile.name) {
          ws_ide.defaultFile.push(ws_ide.openFile.name);
        }
      }
      if (/.*\.ws$/i.test(file.name)) {
        this.setHighlight(true);
      } else {
        this.setHighlight(false);
      }

      $('#aboutArea').html(file.about || '');

      ws_ide.openFile = file;
      ws_ide.loadSource(ws_fs.openFile(file));
      updateEditor();

      showLang();

      ws_ide.initEnv();
    },

    runProgram: function (debugMode, stepMode) {
      $('#btnRun').hide();
      $('#btnStop').show();

      ws_ide.saveFile();

      const ext = getExtension(ws_ide.openFile.name);
      let execPath = [];
      if (!/^wsa?$/i.test(ext)) {
        execPath = ws_ide.getExecPath(ws_ide.openFile.name);
      }

      if (execPath.length > 0) {
        logger.log('Executing VM: ' + execPath.join(' -> '));
        if (ws_ide.getExtension(execPath[0]) === 'ws') {
          try {
            ws_ide.program = ws.compile(ws_fs.openFile(ws_fs.getFile(execPath[0])));
          } catch (err) {
            logger.error("Whitespace interpreter chain (" + execPath.join("->") + ") Error: " + (err.message || err));
            $('#btnRun').show();
            $('#btnStop').hide();
            return;
          }
        } else {
          try {
            ws_ide.program = ws_asm.compile(ws_fs.openFile(ws_fs.getFile(execPath[0])));
          } catch (err) {
            logger.error("Assembly interpreter chain (" + execPath.join("->") + "error: " + (err.message || err));
            $('#btnRun').show();
            $('#btnStop').hide();
            return;
          }
        }

        for (let i = 1; i < execPath.length; i++) {
          ws_ide.inputStream = ws_fs.openFile(ws_fs.getFile(execPath[i])).split('').concat([null]);
        }
        ws_ide.inputStream = ws_ide.openFile.src.split('').concat([null]);

        ws_ide.initEnv();
        ws_ide.env.running = true;

        ws_ide.animateRunning(true);
        ws_ide.continueRun();
        return;
      }

      ws_ide.animateRunning(true);
      try {
        if (!debugMode || !ws_ide.env.running) {
          ws_ide.inputStream = [];
          compileProgram(true);
          if (!debugMode || !ws_ide.env.running) {
            ws_ide.initEnv();
          }
          ws_ide.env.debug = debugMode || false;
          ws_ide.env.running = true;
        } else if (debugMode) {
          ws_ide.env.continueDebug = true;
        }
        ws_ide.env.stepProgram = stepMode || false;
        ws_ide.continueRun();
      } catch (err) {
        if (!err.program) {
          logger.error("Compile Error: " + err);
          $('#btnRun').show();
          $('#btnStop').hide();
        }
      }
    },

    continueRun: function () {
      if (!ws_ide.env.running) return;
      ws_ide.env.runCount = 0;
      try {
        ws_ide.env.runProgram(ws_ide.program);
        if (!ws_ide.env.running) {
          cleanupDebug();
          ws_ide.stopAnimateRunning();
          $('#btnRun').show();
          $('#btnStop').hide();
        }
      } catch (err) {
        if (err === "SLEEP") {
          setTimeout(ws_ide.continueRun, 1);
        } else if (err === "IOWait") {
          // Do nothing - wait for IO
        } else if (err !== "Break") {
          logger.error("Runtime Error: " + err);

          ws_ide.env.running = false;
          ws_ide.stopAnimateRunning();
          $('#btnRun').show();
          $('#btnStop').hide();
        }
      }
      updateMemoryTab(ws_ide.env);
    },

    stepProgram: function () {
      $('#btnRun').show();
      $('#btnStop').hide();
      if (!ws_ide.env.running) {
        ws_ide.runProgram(true, true);
      } else {
        ws_ide.env.stepProgram = true;
        ws_ide.env.continueDebug = true;
        ws_ide.continueRun();
      }
    },

    optimizeProgram: function () {
      const src = programSource();
      const currentStat = getProgramStat(src);
      const prog = ws.compile(src);
      const optSrc = ws_opt.optimize(prog).getWsSrc();
      const optStat = getProgramStat(optSrc);

      logger.log("Optimized " + ws_ide.openFile.name + ":\n" +
          "  Size:         " + currentStat.size + " bytes -> " + optStat.size + " bytes (" + Math.round((currentStat.size - optStat.size) / (currentStat.size || 1) * 100) + "%)\n" +
          "  Instructions: " + currentStat.instCount + " -> " + optStat.instCount + " (" + Math.round((currentStat.instCount - optStat.instCount) / (currentStat.instCount || 1) * 100) + "%)");

      programSource(optSrc);
    },

    switchTab: function (selector) {
      const link = $(selector);

      const tabSelector = $(link).attr("href");
      const tab = $(tabSelector);
      link.closest(".outputTabs").find(".btn").removeClass("activeTab");
      link.closest(".btn").addClass("activeTab").removeClass("emph");

      tab.closest(".allTabs").find(".tabContent:visible").not(tabSelector).hide();
      tab.show();

      resizeUserInput(); // FIXME: Actually only needed when user input displayed
      updateMemoryTab(ws_ide.env);

      return false;
    },

    handleUserInput: function (selector, code) {
      if (typeof code === 'undefined') code = '\n';

      const input = $(selector);
      const val = input.val();
      ws_ide.inputStream = ws_ide.inputStream.concat(val.split('').concat([code]));
      printOutput(val + '\n');
      input.val('');
      this.continueRun();
      return false;
    },

    focusUserInput: function (selector) {
      const input = $(selector);
      input.focus();
    },

    clearPrintArea: function (selector) {
      const area = $(selector);
      if (area.find('span').length > 0) {
        area.find('span:not(:last)').remove();
        area.find('span').html('');
      } else {
        area.html('');
      }
    },

    setHighlight: function (enable) {
      if (ws_ide.highlightEnabled === enable) {
        return;
      }
      ws_ide.highlightEnabled = enable;
      if (enable) {
        $('#btnDisableHighlight').show();
        $('#btnEnableHighlight').hide();
      } else {
        $('#btnDisableHighlight').hide();
        $('#btnEnableHighlight').show();
      }
      updateOverlay();
    },

    newFile: function () {
      const fileName = createNewFile();
      updateFileList();
      ws_ide.loadFile(fileName);
    },

    deleteFile: function () {
      let fileName = ws_ide.openFile.name;
      if (!ws_fs.files[fileName]) return;
      ws_fs.deleteFile(fileName);
      updateFileList();
      while (true) {
        if (!ws_ide.defaultFile.length) break;
        fileName = ws_ide.defaultFile[ws_ide.defaultFile.length - 1];
        if (ws_fs.files[fileName]) {
          ws_ide.loadFile(fileName);
          return;
        } else {
          ws_ide.defaultFile.pop();
        }
      }

      const files = $('div.fileEntry');
      if (files.length > 0) {
        ws_ide.loadFile($(files[0]).attr('title'));
      } else {
        ws_ide.newFile();
      }
    },

    saveFile: function () {
      storeSource();

      const file = ws_ide.openFile;

      if (!file) return;

      if (typeof localStorage === "undefined") return;

      ws_fs.saveFile(file);

      file.changed = false;

      updateEditorFileName();
    },

    handleFileRename: function (fileName, id) {
      const input$ = $('#file_' + id + ' input');
      const newName = input$.val();
      ws_fs.rename(fileName, newName);

      updateFileList();
      ws_ide.loadFile(newName);
      showLang();
      updateEditorFileName();

      return false;
    },
    displayModal: function (selector) {
      const selector$ = $(selector);
      const modal = $('#modal');
      const panels = $('#panels');
      selector$.show();
      modal.show()

      $('#fog').show();

      modal.css('left', (panels.width() / 2 - modal.width() / 2) + "px");
      modal.css('top', (panels.height() / 2 - modal.height() / 2) + "px");
    },
    hideModal: function () {
      $('#fog').hide();
      $('#modal').hide();
      $('#modal .modalContent').hide();
    },

    toggleBreakpoint: function (ip) {
      const instrDiv = $('#instr_' + ip);

      if (ip in ws_ide.openFile.breakpoints) {
        delete ws_ide.openFile.breakpoints[ip];
        instrDiv.removeClass('breakpoint');
      } else {
        ws_ide.openFile.breakpoints[ip] = true;
        instrDiv.addClass('breakpoint');
      }
    },

    compileAsm: function () {
      let wsSrc;
      ws_ide.saveFile();

      const ext = getExtension(ws_ide.openFile.name);
      const compilePath = getCompilePath(ext);

      if (!/wsa$/.test(ext) && compilePath.length === 0) {
        logger.error("No way to compile program");
        return;
      }

      if (compilePath.length > 0) {
        if (ws_ide.getExtension(compilePath[0].file) === 'ws') {
          ws_ide.program = ws.compile(ws_fs.openFile(ws_fs.getFile(compilePath[0].file)));
        } else {
          ws_ide.program = ws_asm.compile(ws_fs.openFile(ws_fs.getFile(compilePath[0].file)));
        }

        ws_ide.inputStream = [];
        for (let i = 1; i < compilePath.length; i++) {
          ws_ide.inputStream = ws_ide.inputStream.concat(ws_fs.openFile(ws_fs.getFile(compilePath[i].file)).split('').concat([null]));
        }
        ws_ide.inputStream = ws_ide.inputStream.concat(ws_ide.openFile.src.split('').concat([null]));
        ws_ide.initEnv();
        ws_ide.env.running = true;
        let output = '';
        ws_ide.env.print = function (m) {
          output += m;
        }

        while (ws_ide.env.running) {
          ws_ide.continueRun();
        }

        if (compilePath[0].to === 'ws') {
          wsSrc = output;
        } else if (compilePath[0].to === 'wsa') {
          wsSrc = ws_asm.compile(output).getWsSrc();
        } else {
          throw "Invalid compile result.";
        }
      } else {
        wsSrc = ws_ide.program.getWsSrc();
      }

      if (ws_ide.program.compileError) {
        logger.error(ws_ide.program.compileError)
        return;
      }

      const fileName = ws_ide.openFile.name.replace(/\.[^.]*$/, '') + '.ws';

      if (!(fileName in ws_fs.files)) {
        createNewFile(fileName);
      }
      const file = ws_fs.getFile(fileName);

      file.src = wsSrc;

      updateFileList();
      ws_ide.loadFile(fileName);
    },

    downloadFile: function () {
      window.open('data:text/plain;base64,' + btoa(ws_ide.openFile.src), '_download');
    },

    stopProgram: function () {
      $('#btnRun').show();
      $('#btnStop').hide();

      if (ws_ide.env) {
        if (!ws_ide.env.running) {
          return;
        }
        ws_ide.env.running = false;
      }
      cleanupDebug();
      ws_ide.stopAnimateRunning();
    },

    animateRunning: function () {
      $('#animDiv').show();
    },
    updateSnake: function (resume) {
      const ad = $('#animDiv');
      ad.text(ws_ide.animation[ws_ide.animator]);
      ws_ide.animator = (ws_ide.animator + 1) % ws_ide.animation.length;
      setTimeout(ws_ide.updateSnake, 150);
    },

    stopAnimateRunning: function () {
      $('#animDiv').hide();
    },

    displayHelp: function () {
      const helpModal = $('#helpModal');
      const content = helpModal.find("#helpModalContent");
      ws_ide.displayModal(helpModal);
      if (!content.find('iframe').length) {
        const iframe = $('<iframe style="width:100%; height:100%"></iframe>');
        iframe.attr('src', 'help.html');
        content.append(iframe);
      }
    },

    getExecPath: getExecPath,
    getExtension: getExtension
  };
  $(self.init);

  return self;
})();
