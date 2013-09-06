var console = (function () {
  var writeTab = function (msg) {
    var consoleArea = $('#consoleArea');
    consoleArea.append('<div>' + msg + '<div>');
    consoleArea.scrollTop(consoleArea[0].scrollHeight);
    ws_util.handleOverflow(consoleArea);
 
   var tabLabel = $('#tabLabelConsole');
    if (!tabLabel.is('.activeTab')) {
      tabLabel.addClass('emph');
    }
  };
  return {
    log: writeTab,
    info: writeTab,
    error: writeTab
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

  var compileProgram = function() {
    var disasm = $('#disasm');
    disasm.html('');

    var openFile = ws_ide.openFile;
    var src = programSource();
    var errorDiv = $('#errorDiv');
    errorDiv.html('&nbsp;');
    try { 
      if (openFile.lang == "WS") {
        ws_ide.program = ws.compile(src);
      } else {
        ws_ide.program = ws_asm.compile(src);
      }
    } catch (err) {
      if (err.program) {
        errorDiv.text(err.message);
        ws_ide.program = err.program;
      } else {
        throw err;
      }
    }
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
    ws_util.handleOverflow(disasm.parent());
  };

  var updateEditor = function(evt) {
    updateOverlay();
    ws_util.handleOverflow("#scrollableSource");

    compileProgram();
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
        last.after('<br><span></span>');
        last = printArea.find('span:last');
      }
      last.html(last.html() + arr[ln]);
    }
    outputArea = printArea.closest('.outputArea');
    ws_util.handleOverflow(outputArea);
    outputArea.scrollTop(outputArea[0].scrollHeight);

    var tabLabel = $('#tabLabelPrint');
    if (!tabLabel.is('.activeTab')) {
      tabLabel.addClass('emph');
    }
    resizeUserInput();
  };

  var readChar = function() {
    if (ws_ide.inputStreamPtr < ws_ide.inputStream.length) {
      return ws_ide.inputStream[ws_ide.inputStreamPtr++];
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
      var line = $('<div id="file_'+ id + '"></div>');
      line.addClass('fileEntry');
      if (file.lang == "WSA") {
        line.addClass('fileTypeAsm');
      } else {
        line.addClass('fileTypeWs');
      }
      if (!file.localStorage) {
        var link = $('<a href="javascript: void(0);" onClick="ws_ide.loadFile(\'' + fileName + '\');"></a>')
        link.html('<div class="ico"></div>' + $('<span></span>').text(fileName).html());
        link.appendTo(line);
      } else {
        var link = $('<div><div class="ico"></div></div>');
        link.click((function(fileName) {
          return function() {
            ws_ide.loadFile(fileName);
            $(this).find('input').focus().select();
          }
        })(fileName));
        var form = $('<form onsubmit="return false;"></form>');
        var inp = $('<input type="text" class="userInput"></input>');
        var nameChange = (function (fileName, id) {
          return function () {
            ws_ide.handleFileRename(fileName, id);
          };
        })(fileName, id);
        inp.blur(nameChange);
        inp.change(nameChange);
        inp.val(file.name);
        inp.appendTo(form);

        form.appendTo(link);
        link.appendTo(line);
      }
      line.appendTo(fileList);
      
    }
    ws_util.handleOverflow(fileList.closest('.content'));
  };

  var storeSource = function () {
    var file = ws_ide.openFile;
    if (!file) return;
    file.src = programSource();
  };

  var showLang = function(lang) {
    $('#filetype .btn').hide();
    $('#filetype #lang_' + lang).show();
    if (lang == "WS") {
      $('#btnOptimize').show();
    } else {
      $('#btnOptimize').hide();
    }
    if (lang == "WSA") {
      $('#btnCompile').show();
    } else {
      $('#btnCompile').hide();
    }
  };

  var beforeInstructionRun = function(env) {
    if (!env.debug) return;

    $('#disasm .running').removeClass('running');
    $('#disasm #instr_' + env.register.IP).addClass('running');
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
    $('.asmline.running').removeClass('running');
  };

  var createNewFile = function (fileName) {
    if (!fileName) {
      fileName = 'New file ';
      var count = 1;
      while (true) {
        if (!((fileName + count) in ws_fs.files)) {
          fileName = fileName + count;
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
      lang: "WS",
      localStorage: true
    };
    ws_fs.saveFile(file);
    
    return fileName;
  };

  var self = {
    files: {},
    inputStream: '',
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
      $('#srcInput').keyup(updateEditor);
      $('#srcInput').keydown(function(e){
        var ret=interceptTabs(e, this);
        return ret;
      });

      ws_ide.loadFile("hworld.ws");

      updateFileList();

      ws_ide.initEnv();
      ws_ide.switchTab('a[href=#printTab]');

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
      storeSource();
      $('#fileList .fileEntry.emph').removeClass('emph');
      var file = ws_fs.getFile(fileName);
      if (!file) return;

      if (ws_ide.openFile) {
        if (ws_ide.defaultFile[ws_ide.defaultFile.length -1] != ws_ide.openFile.name) {
          ws_ide.defaultFile.push(ws_ide.openFile.name);
        }
      }
      if (file.lang == 'WS' || file.file.match(/\.ws$/i)) {
        this.setHighlight(true);
      } else {
        this.setHighlight(false);
      }

      ws_ide.openFile = file;
      ws_ide.loadSource(ws_fs.openFile(file));
      updateEditor();
      $('#panelMiddleLabel span').text(file.file);
 

      $('.localStorageButton').hide();

      if (file.localStorage) {
        $('.localStorageButton').show();
      }

      showLang(file.lang || 'WS');

      ws_ide.initEnv();
    },

    runProgram: function(debugMode, stepMode) {
     ws_ide.animateRunning(true);
      try {
        if (!debugMode || !ws_ide.env.running) { 
          ws_ide.inputStream = '';
          ws_ide.inputStreamPtr = 0;
          compileProgram();
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
          console.error("Compile Error: " + err);
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
        }
      } catch (err) {
        if (err == "SLEEP") {
          setTimeout(ws_ide.continueRun, 1);
        } else if (err == "IOWait") {
          // Do nothing - wait for IO
        } else if (err != "Break") {
          console.error("Runtime Error: " + err);
          ws_ide.env.running = false;
        }
      }
      updateMemoryTab(ws_ide.env);
    },

    stepProgram: function () {
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
      var src = ws.reduceProgram(ws.compile(src));
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

    handleUserInput: function (selector) {
      var input = $(selector);
      var val = input.val() + '\n';
      ws_ide.inputStream += val;
      printOutput(val);
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
        ws_util.handleOverflow(area.parent());
      } else {
        area.html('');
        ws_util.handleOverflow(area);
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
      if (!ws_fs.files[fileName] || 
          !ws_fs.files[fileName].localStorage) {
        return;
      }
      ws_fs.deleteFile(fileName);
      updateFileList();
      while (true) {
        if (!ws_ide.defaultFile.length) break;
        fileName = ws_ide.defaultFile[ws_ide.defaultFile.length - 1];
        if (ws_fs.files[fileName]) {
          ws_ide.loadFile(fileName);
          break;
        } else {
          ws_ide.defaultFile.pop();
        }
      }
    },

    saveFile: function () {
      storeSource();

      var file = ws_ide.openFile;

      if (!file || !file.localStorage) return;

      if (typeof localStorage == "undefined") return;

      ws_fs.saveFile(file);
    },

    handleFileRename: function (fileName, id) {
      var input$ = $('#file_' + id + ' input');
      ws_fs.rename(fileName, input$.val());
      
      updateFileList();
    },
    displayModal: function(selector) {
      var selector$ = $(selector);
      var modal = $('#modal');
      var fog = $('#fog');
      fog.click(ws_ide.hideModal);
      modal.html(selector$.html());

      $('#fog').show();

      modal.css('left', (fog.width() / 2 - modal.width() / 2) + "px");
      modal.css('top', (fog.height() / 2 - modal.height() / 2) + "px");
    },
    hideModal: function() {
      $('#fog').hide();
      $('#modal').html('');
    },
    setLang: function(lang) {
      ws_ide.openFile.lang = lang;
      showLang(lang);
      updateFileList();
      compileProgram();
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
      var fileName = "compile.ws";
      if (!(fileName in ws_fs.files)) {
        createNewFile(fileName);
      }
      var file = ws_fs.getFile(fileName);

      var wsSrc = ws_ide.program.getWsSrc();
      file.src = wsSrc;

      updateFileList();
      ws_ide.loadFile(fileName);
    },

    downloadFile: function() {
      window.open('data:text/plain;base64,' + btoa(ws_ide.openFile.src), '_download');
      
    },
    
    stopProgram: function() {
      if (!ws_ide.env.running) {
        return;
      }
      ws_ide.env.running = false;
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
    }

  };
  $(self.init);

  return self;
})();


