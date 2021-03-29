var logger = (function () {
  var writeTab = function (msg, level) {
    var consoleArea = $('#consoleArea');
    consoleArea.append('<div>' + (level?level+': ':'') + msg + '<div>');
    consoleArea.scrollTop(consoleArea[0].scrollHeight);
 
   var tabLabel = $('#tabLabelConsole');
    if (!tabLabel.is('.activeTab')) {
      tabLabel.addClass('emph');
    }
  };
  return {
    log: writeTab,
    info: function(msg) {writeTab (msg, "INFO");},
    error: function(msg) {writeTab(msg, "ERROR"); },
    warn: function(msg) {writeTab(msg, "WARNING");}
  };
})();

var ws_ide = (function () {
  var updateOverlay = function() {
    var srcInput = $('#srcInput');
    var srcOverlay = $('#srcOverlay');
    var src = srcInput.val();
    var overlay = '';
    if (ws_ide.highlightEnabled && ws_ide.openFile) {
      overlay = ws_ide.highlightSourceWs(src);
    }
    srcOverlay.html(overlay);

    var pre = $('#srcHiddenDiv');
    pre.text(src);
  
    srcInput.width(pre.width() + 30 );
    srcInput.height(pre.height() + 30);
    $('#inputContainer').height(srcInput.height()); 
  };

  var getExtension = function(fn) {
    return fn.replace(/.*\.([^.]+)$/,'$1');
  };

  getExecPath = function(fn, vms) {
    if (typeof vms == 'undefined') {
      var vms = ws_fs.getFileNames(/^vm\//);
    }

    var ext = getExtension(fn);

    for (var i = 0; i < vms.length; i++) {
      if (vms[i].match('^vm/' + ext + '\\..*')) {
        var vmExt = getExtension(vms[i]);
        if (vmExt === 'ws' || vmExt === 'wsa') {
          return [vms[i]];
        } else {
          var subPath = getExecPath(vms[i], vms.slice(0,i).concat(vms.slice(i+1)));
          if (subPath.length > 0) {
            return subPath.concat([vms[i]]);
          }
        } 
      }
    }
    return [];
  }

  getCompilePath = function(fn, wcs) {
    if (typeof wcs == 'undefined') {
     var wcs = ws_fs.getFileNames(/^wc\/.*\.wsa?$/);
    }

    var ext = getExtension(fn);

    for (var i = 0; i < wcs.length; i++) {
      var expr = /^wc\/([^2]+)2(.+)\.wsa?$/;
      if (!wcs[i].match(expr)) continue;
      var e = {file: wcs[i]};

      e.from = e.file.replace(expr, '$1');

      if (e.from !== ext) continue; 

      e.to = e.file.replace(expr, '$2');

      if (e.to.match(/^wsa?$/)) return [e];
      var subPath = getCompilePath(e.to, wcs.slice(0, i).concat(wcs.slice(i+1)));
      if (subPath.length > 0) return subPath.concat([e]);
    }
    return [];
  }

  var compileProgram = function(showPath) {
    var disasm = $('#disasm');
    disasm.html('');

    var openFile = ws_ide.openFile;
    var ext = getExtension(openFile.name);

    if (!ext.match(/^wsa?$/i)) return;

    var src = programSource();
    var errorDiv = $('#errorDiv');
    errorDiv.html('&nbsp;');
    try {
      if (ext.match(/^ws$/i)) {
        ws_ide.program = ws.compile(src);
      } else if (ext.match(/^wsa$/i)) {
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
      if (err.program) {
        ws_ide.program = err.program;
        ws_ide.program.compileError = err.message;
      } 
    }

    if (ext.match(/^wsa?$/i)) {
      var disasmSrc = ws_ide.program.getAsmSrc();
      for (var i in disasmSrc) {
        var ln = disasmSrc[i];
        var div = $('<div class="asmLine"></div>');
        div.text(ln.str);

        if (ln.IP != null) {
          div.addClass('asmInstr');
          div.attr('id', 'instr_' + ln.IP);

          if (ws_ide.openFile.breakpoints && ln.IP in ws_ide.openFile.breakpoints) {
            div.addClass('breakpoint');
          }

          div.click((function(ip) { 
            return function () {ws_ide.toggleBreakpoint(ip);}
           })(ln.IP));
        } else {
          div.addClass('asmLabel');
        }
        div.appendTo(disasm);
      }
      ws_ide.openFile.breakpoints = ws_ide.openFile.breakpoints || {}
    }
  };

  var updateEditorFileName = function(file) {
    var prefix = '';
    file = file || ws_ide.openFile;

    if (!file.extFile) prefix = '(Local Storage) '
    if (file.changed) prefix += '*';

    $('#panelMiddleLabel span').text(prefix + file.name);
  }

  var updateEditor = function(evt) {
    updateOverlay();

    compileProgram();

    updateEditorFileName();
  }

  var programSource = function (src) {
    var srcInput = $('#srcInput');
    if (typeof src == "undefined") {
      return srcInput.val();
    } else {
     var ret = ws_ide.loadSource(src);
     updateEditor();
     return ret;
    }
  };

  var resizeUserInput = function() {
    var input = $('#userInput');
    var form = input.closest('form');
    var container = form.parent();
    input.width(0);
    input.width(container.width() - (input.position().left - container.position().left));
  }

  var printOutput = function(str) {
    if (typeof str != "string") {
      str = "" + str;
    }
    var printArea = $('#printArea');
    var arr = str.split('\n');
    var last = printArea.find('span:last');
    for (var ln in arr) {
      if (ln != 0) {
        last.after('<br><span style="display:inline-block; min-height:13px" autocomplete="off"></span>');
        last = printArea.find('span:last');
      }
      last.html(last.html() + arr[ln]);
    }
    outputArea = printArea.closest('.outputArea');
    outputArea.scrollTop(outputArea[0].scrollHeight);

    var tabLabel = $('#tabLabelPrint');
    if (!tabLabel.is('.activeTab')) {
      tabLabel.addClass('emph');
    }
    resizeUserInput();
  };

  var readChar = function() {
    if (ws_ide.inputStream.length > 0) {
      return ws_ide.inputStream.shift();
    } else {
      ws_ide.focusUserInput('#userInput');
      throw "IOWait";
    }
  }

  var readNum = function() {
    var numStr = "";
    while (true) {
      var ch = readChar();
      if (ch == '\n') break;
      numStr += ch; 
    }
    var num = parseInt(numStr);
    if (typeof num == "NaN") {
      throw "Illegal number entered!";
    }
    return num;
  };

  var updateMemoryTab = function (env) {
    $('#stackSpan').html('[' + env.stack.slice(0,env.register.SP).join(', ') + ']');
    var heapArr = [];
    var heap = env.heap.toArray();
    for (i in heap) {
      heapArr.push(i + ':' + heap[i]);
    }
    $('#heapSpan').html('{\t' + heapArr.join(',\t') + '}');
  }
 
  var afterInstructionRun = function(env) {
    env.runCount++;
    if (env.runCount > 100) { // TODO - find a better solution
      throw "SLEEP";
    }
    if (env.debug) {
      updateMemoryTab(env);
    }
  };

  var stupidHash = function (str) {
    return btoa(str).replace(/[^a-zA-Z0-9]/g, '_'); 
  };

  var updateFileList = function () {
    var fileList = $('#fileList');
    fileList.find('.fileEntry').remove();


    var sortedFileNames = ws_fs.getFileNames();

    var id = 0;
    for (var i in sortedFileNames) {
      ++id;
      var fileName = sortedFileNames[i];
      var file = ws_fs.getFile(fileName);
      var line = $('<div id="file_'+ id + '" title="' + fileName + '"></div>');
      line.addClass('fileEntry');
      var link = $('<div><div class="ico"></div></div>');
      var form = $('<form onsubmit="return false;"></form>');
      var inp = $('<input type="text" class="userInput"></input>');
      var nameChange = (function (fileName, id) {
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

  var storeSource = function () {
    var file = ws_ide.openFile;
    if (!file) return;
    var prog = programSource();
	if (file.changed) {
      file.extFile = false;
      updateEditorFileName();
    }
    file.src = prog;
  };

  var programRunnable = function() {
    var ext = getExtension(ws_ide.openFile.name);
    if (ext.match(/^wsa?$/i)) return true;
    if (ws_ide.getExecPath(ws_ide.openFile.name).length > 0) return true;
    return false; 
  }

  var programCompilable = function() {
    var ext = getExtension(ws_ide.openFile.name);
    if (ext.match(/^wsa$/i)) return true;
    if (getCompilePath(ext).length > 0) return true;
    return false; 
  }

  var programOptimizable = function() {
    var ext = getExtension(ws_ide.openFile.name);
    if (ext.match(/^ws$/i)) return true;
    return false; 
  }    

  var showLang = function() {

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

  var beforeInstructionRun = function(env) {
    if (!env.debug || !env.running) return;

    $('#disasm .running').removeClass('running');
    var instLine = $('#disasm #instr_' + env.register.IP);
    var scroller = instLine.closest(".content");

    if (instLine.length == 0) return;

    // Scroll to view
    if ((instLine.offset().top + instLine.height()) > scroller.offset().top + scroller.height() || instLine.offset().top < scroller.offset().top) {
      scroller.animate({scrollTop:(scroller.scrollTop() + instLine.offset().top - scroller.height() / 2) + "px"}, 0);
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

  var cleanupDebug = function() {
    $('.asmline.running').removeClass('unning');
  };

  var createNewFile = function (fileName) {
    if (!fileName) {
      fileName = 'New file ';
      var count = 1;
      while (true) {
        var fn = fileName + count + '.ws';
        if (!(fn in ws_fs.files)) {
          fileName = fn;
          break;
        }
        count++;
      }
    }
    var file = {
      name: fileName,
      file: "<localStorage>",
      autohor: "",
      origin: "",
      src: "",
      localStorage: true,
      changed: false 
    };
    ws_fs.saveFile(file);
    
    return fileName;
  };

  var getProgramStat = function(src) {
    var size = src.length;
    var prog = ws.compile(src);
    var instCount = prog.programStack.length;
    return {
      size: size,
      instCount: instCount
    };
  }

  var self = {
    files: {},
    inputStream: [],
    inputStreamPtr: 0,
    animator: 0,
//    animation: ['-', '\\', '|', '/'],
    animation: ['.oO0 ', ' .oO0', '  .o0', '   .0', '    0', '   0O', '  00o', ' 0Oo.', '0Oo. ', '0o.  ', '0.   ', '0    ', 'O0   ', 'oO0  ',], 
    defaultFile: [],
    highlightSourceWs: function(src) {
      return src.replace(/[^\t\n ]/g, '#')
                .replace(/([ ]+)/g, '<span class="spaces">\$1</span>')
                .replace(/(\t+)/g, '<span class="tabs">\$1</span>')
                .replace(/#/g,' ');
    
    },
    
    init: function() {
      var input = $('#srcInput');
      input.bind("input paste keyup", function () {
        ws_ide.openFile.src = this.value;
        ws_ide.openFile.changed = true;
        updateEditor();
      });
      input.bind("propretychange", updateEditor);

      input.keydown(function(e){
        var ret=interceptTabs(e, this);
        return ret;
      });

      updateFileList();

      ws_ide.loadFile("hworld.ws");

      ws_ide.initEnv();
      ws_ide.switchTab('a[href="#printTab"]');

      ws_ide.displayModal('#splashScreenModal');
    },

    initEnv: function () {
      var env = ws.env();
      env.print = printOutput;
      env.readChar = readChar;
      env.readNum = readNum;
      env.afterInstructionRun = afterInstructionRun;
      env.beforeInstructionRun = beforeInstructionRun;
      ws_ide.env = env;
      return env;
    },

    loadSource: function(src) {
      var ret = $('#srcInput').val(src);
      updateEditor();
      return ret;
    },

    loadFile: function(fileName) {
      $('#fileList .fileEntry.emph').removeClass('emph');
      $('div.fileEntry input').filter(
          function() { return $(this).val() === fileName; }
      ).parents('div.fileEntry').addClass('emph');

    if (ws_ide.openFile && ws_ide.openFile.name === fileName) return;

      ws_ide.stopProgram();

      storeSource();
      var file = ws_fs.getFile(fileName);
      if (!file) return;

       if (ws_ide.openFile) {
        if (ws_ide.defaultFile[ws_ide.defaultFile.length -1] != ws_ide.openFile.name) {
          ws_ide.defaultFile.push(ws_ide.openFile.name);
        }
      }
      if (file.name.match(/.*\.ws$/i)) {
        this.setHighlight(true);
      } else {
        this.setHighlight(false);
      }

      ws_ide.openFile = file;
      ws_ide.loadSource(ws_fs.openFile(file));
      updateEditor();
 
      showLang();

      ws_ide.initEnv();
    },

    runProgram: function(debugMode, stepMode) {
      $('#btnRun').hide();
      $('#btnStop').show();

      var ext = getExtension(ws_ide.openFile.name);
      var execPath = [];
      if (!ext.match(/^wsa?$/i)) {
        execPath = ws_ide.getExecPath(ws_ide.openFile.name);
      }

      if (execPath.length > 0) {
        logger.log('Executing VM: ' + execPath.join(' -> '));
        if (ws_ide.getExtension(execPath[0]) === 'ws') {
          ws_ide.program = ws.compile(ws_fs.openFile(ws_fs.getFile(execPath[0])));
        } else {
          ws_ide.program = ws_asm.compile(ws_fs.openFile(ws_fs.getFile(execPath[0])));
        }

        for (var i = 1; i < execPath.length; i++) {
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

    continueRun: function() {
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
        if (err == "SLEEP") {
          setTimeout(ws_ide.continueRun, 1);
        } else if (err == "IOWait") {
          // Do nothing - wait for IO
        } else if (err != "Break") {
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

    optimizeProgram: function() {
      var src = programSource();
      var currentStat = getProgramStat(src);
      var prog = ws.compile(src);
      var src = ws_opt.optimize(prog).getWsSrc();
      var optStat = getProgramStat(src);

      logger.log("Optimized " + ws_ide.openFile.name + ":\n" + 
                  "  Size:         " + currentStat.size + " bytes -> " + optStat.size + " bytes (" + Math.round((currentStat.size - optStat.size) / (currentStat.size || 1) * 100) + "%)\n" + 
                  "  Instructions: " + currentStat.instCount + " -> " + optStat.instCount + " (" + Math.round((currentStat.instCount - optStat.instCount) / (currentStat.instCount || 1) * 100) + "%)");

      programSource(src);
    },
    
    switchTab: function(selector) {
      var link = $(selector);

      var tabSelector = $(link).attr("href");
      var tab = $(tabSelector);
      link.closest(".outputTabs").find(".btn").removeClass("activeTab");
      link.closest(".btn").addClass("activeTab").removeClass("emph");

      tab.closest(".allTabs").find(".tabContent:visible").not(tabSelector).hide();
      tab.show();

      resizeUserInput(); // FIXME: Actually only needed when user input displayed
 
      return false; 
    },

    handleUserInput: function (selector, code) {
      if (typeof code === 'undefined') code = '\n';

      var input = $(selector);
      var val = input.val();
      ws_ide.inputStream = ws_ide.inputStream.concat(val.split('').concat([code]));
      printOutput(val + '\n');
      input.val('');
      this.continueRun();
      return false;
    },

    focusUserInput: function (selector) {
      var input = $(selector);
      input.focus();
    },

    clearPrintArea: function (selector) {
      var area = $(selector);
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
      var fileName = createNewFile();
      updateFileList();
      ws_ide.loadFile(fileName);
    },

    deleteFile: function () {
      var fileName = ws_ide.openFile.name;
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

      var files = $('div.fileEntry');
      if (files.length > 0) {
        ws_ide.loadFile($(files[0]).attr('title'));
      } else {
        ws_ide.newFile();
      }

    },

    saveFile: function () {
      storeSource();

      var file = ws_ide.openFile;

      if (!file) return;

      if (typeof localStorage == "undefined") return;

      ws_fs.saveFile(file);

      file.changed = false;

      updateEditorFileName();
    },

    handleFileRename: function (fileName, id) {
      var input$ = $('#file_' + id + ' input');
      var newName = input$.val();
      ws_fs.rename(fileName, newName);
      

      updateFileList();
      ws_ide.loadFile(newName);
      showLang();
      updateEditorFileName();

      return false;
    },
    displayModal: function(selector) {
      var selector$ = $(selector);
      var modal = $('#modal');
      var panels = $('#panels');
      selector$.show();
      modal.show()

      $('#fog').show();

      modal.css('left', (panels.width() / 2 - modal.width() / 2) + "px");
      modal.css('top', (panels.height() / 2 - modal.height() / 2) + "px");
    },
    hideModal: function() {
      $('#fog').hide();
      $('#modal').hide();
      $('#modal .modalContent').hide();
    },

    toggleBreakpoint: function(ip) {
      var instrDiv = $('#instr_' + ip);

      if (ip in ws_ide.openFile.breakpoints) {
        delete ws_ide.openFile.breakpoints[ip];
        instrDiv.removeClass('breakpoint');
      } else {
        ws_ide.openFile.breakpoints[ip] = true;
        instrDiv.addClass('breakpoint');
      }
    },

    compileAsm: function() {
      var ext = getExtension(ws_ide.openFile.name);
      var compilePath = getCompilePath(ext);

      if (!ext.match(/wsa$/) && compilePath.length == 0) {
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
        for (var i = 1; i < compilePath.length; i++) {
          ws_ide.inputStream = ws_ide.inputStream.concat(ws_fs.openFile(ws_fs.getFile(compilePath[i].file)).split('').concat([null]));
        }
        ws_ide.inputStream = ws_ide.inputStream.concat(ws_ide.openFile.src.split('').concat([null]));
        ws_ide.initEnv();
        ws_ide.env.running = true;
        var output = '';
        ws_ide.env.print = function (m) {
          output += m;
        }

        while (ws_ide.env.running) {
          ws_ide.continueRun();
        }

        if (compilePath[0].to == 'ws') {
          var wsSrc = output;
        } else if (compilePath[0].to == 'wsa') {
          console.log(output);
          var wsSrc = ws_asm.compile(output).getWsSrc();
        } else {
          throw "Invalid compile result.";
        }


      } else {
        var wsSrc = ws_ide.program.getWsSrc();
      }

      if (ws_ide.program.compileError) {
        logger.error(ws_ide.program.compileError)
        return;
      }

      var fileName = ws_ide.openFile.name.replace(/\.[^.]*$/,'') + '.ws';

      if (!(fileName in ws_fs.files)) {
        createNewFile(fileName);
      }
      var file = ws_fs.getFile(fileName);

      file.src = wsSrc;

      updateFileList();
      ws_ide.loadFile(fileName);
    },

    downloadFile: function() {
      window.open('data:text/plain;base64,' + btoa(ws_ide.openFile.src), '_download');
      
    },
    
    stopProgram: function() {
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

    animateRunning: function(resume) {
      var ad = $('#animDiv');
      if (ws_ide.animator < 0 && resume) {
        ws_ide.animator = 0;
      } else if (ws_ide.animator < 0) {
        ad.html('&nbsp;');
        return;
      }
      ad.text(ws_ide.animation[ws_ide.animator]);
      ws_ide.animator = (ws_ide.animator + 1) % ws_ide.animation.length;
      setTimeout(ws_ide.animateRunning, 150);
    },

    stopAnimateRunning: function () {
     ws_ide.animator = -1;
    },

    displayHelp: function () {
      var helpModal = $('#helpModal');
      var content = helpModal.find("#helpModalContent");
      ws_ide.displayModal(helpModal);
      if (!content.find('iframe').length) {
        var iframe = $('<iframe style="width:100%; height:100%"></iframe>');
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


