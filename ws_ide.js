var ee;
ee = ee || {};
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

ee.wsIde = (function () {
  var updateOverlay = function() {
    var srcInput = $('#srcInput');
    var srcOverlay = $('#srcOverlay');
    var src = srcInput.val();
    var overlay = '';
    if (ee.wsIde.highlightEnabled && ee.wsIde.openFile) {
      overlay = ee.wsIde.highlightSourceWs(src);
    }
    srcOverlay.html(overlay);

    var pre = $('#srcHiddenDiv');
    pre.html(src);
  
    srcInput.width(pre.width() + 30 );
    srcInput.height(pre.height() + 30);
    $('#inputContainer').height(srcInput.height()); 
  };

  var compileProgram = function() {
    var panel = $('#panelRight .content');
    panel.html('');

    var openFile = ee.wsIde.openFile;
    var src = programSource(); 
    if (openFile.lang == "WS") {
      ee.wsIde.program = ws.compile(src);
    } else {
      ee.wsIde.program = ws_asm.compile(src);
    }
    panel.html(ee.wsIde.program.getAsmSrc());
    ws_util.handleOverflow(panel);
  };

  var updateEditor = function(evt) {
    updateOverlay();
    ws_util.handleOverflow("#scrollableSource");
    try {
      compileProgram();
    } catch (err) {
      // Ignore it at the moment
    }
  }

  var programSource = function (src) {
    var srcInput = $('#srcInput');
    if (typeof src == "undefined") {
      return srcInput.val();
    } else {
     var ret = ee.wsIde.loadSource(src);
     updateEditor();
     return ret;
    }
  };

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

  };

  var readChar = function() {
    if (ee.wsIde.inputStreamPtr < ee.wsIde.inputStream.length) {
      return ee.wsIde.inputStream[ee.wsIde.inputStreamPtr++];
    } else {
      ee.wsIde.focusUserInput('#userInput');
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
 
    for (var fileKey in ee.wsIde.files) {
      var file = ee.wsIde.files[fileKey];
      var line = $('<div id="file_'+ fileKey + '"></div>');
      line.addClass('fileEntry');
      if (file.lang == "WSA") {
        line.addClass('fileTypeAsm');
      } else {
        line.addClass('fileTypeWs');
      }
      var link = $('<a href="javascript: void(0);" onClick="ee.wsIde.loadFile(\'' + fileKey + '\');"></a>')
      link.html('<div class="ico"></div>' + file.name);
      link.appendTo(line);
      line.appendTo(fileList);
    }
    ws_util.handleOverflow(fileList.parent());
  };

  var self = {
    files: {},
    inputStream: '',
    inputStreamPtr: 0,
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
      ee.wsIde.initExamples();
      ee.wsIde.initEnv();
      ee.wsIde.switchTab('a[href=#printTab]');
    },

    initEnv: function () {
      var env = ws.env();
      env.print = printOutput;
      env.readChar = readChar;
      env.readNum = readNum;
      env.afterInstructionRun = afterInstructionRun;
      ee.wsIde.env = env;
      return env;
    },

    loadSource: function(src) {
      var ret = $('#srcInput').val(src);
      updateEditor();
      return ret;
    },

    loadFile: function(idx) {
      $('#fileList:not(#file_' + idx + ') .fileEntry.emph').removeClass('emph');
      $('#fileList #file_' + idx).addClass('emph');
      var ex = ee.wsIde.files[idx];
      if (!ex) return;

      if (ee.wsIde.openFile) {
        ee.wsIde.defaultFile = ee.wsIde.openFile.fileKey;
      }
      var load = function(src) {
        ee.wsIde.openFile = ex;
        if (!ex.src) ex.src = src;
        ee.wsIde.loadSource(src);
        updateEditor();
        $('#panelMiddleLabel span').html(ex.file);
      }
      if (ex.lang == 'WS' || ex.file.match(/\.ws$/i)) {
        this.setHighlight(true);
      } else {
        this.setHighlight(false);
      }

      $('#deleteFile').hide();

      if (typeof ex.src != "undefined") {
        load(ex.src);
        if (ex.localStorage) {
          $('#deleteFile').show();
        }
      } else {
        $.get(ex.file, load);
      }

    },

    initExamples: function () {
      $.getJSON('example/meta.json', function(result) {
        var loadFirst = '';
        for(var i=0; i < result.examples.length; i++) {
          var ex = result.examples[i];
          var fileKey = stupidHash(ex.file);
          ee.wsIde.defaultFile = ee.wsIde.defaultFile || fileKey;
          
          ex.fileKey = fileKey;
          ee.wsIde.files[fileKey] = ex;
       }

        updateFileList();

        if (ee.wsIde.defaultFile) {
          ee.wsIde.loadFile(ee.wsIde.defaultFile);
        }
      });

    },

    runProgram: function() {
      try {
        this.inputStream = '';
        this.inputStreamPtr = 0;
        ee.wsIde.initEnv();
        compileProgram();
        ee.wsIde.env.running = true;
        ee.wsIde.continueRun();
      } catch (err) {
        console.error("Compile Error: " + err);
      }
    },

    continueRun: function() {
     if (!ee.wsIde.env.running) return;
     try {
        ee.wsIde.env.runProgram(ee.wsIde.program);
      } catch (err) {
        if (err == "IOWait") {
          // Do nothing - wait for IO
        } else if (err != "Break") {
          console.error("Runtime Error: " + err);
          ee.wsIde.env.running = false;
        }
      }
      updateMemoryTab(ee.wsIde.env);
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
      return false; 
    },

    handleUserInput: function (selector) {
      var input = $(selector);
      var val = input.val() + '\n';
      ee.wsIde.inputStream += val;
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
      if (ee.wsIde.highlightEnabled === enable) {
        return;
      }
      ee.wsIde.highlightEnabled = enable;
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
      var fileName = 'New file ';
      var count = 1;
      var fileKey = '';
      while (true) {
        fileKey = stupidHash(fileName + count);
        if (!ee.wsIde.files[fileKey]) {
          fileName = fileName + count;
          break;
        }
        count++;
      }
      var file = {
        fileKey: fileKey,
        name: fileName,
	file: "<no file>",
        autohor: "",
        origin: "",
        src: "",
        lang: "WS",
        localStorage: true
      }
      ee.wsIde.files[fileKey] = file;
      updateFileList();
      ee.wsIde.loadFile(fileKey);
    },
    deleteFile: function () {
      var fileKey = ee.wsIde.openFile.fileKey;
      if (!ee.wsIde.files[fileKey]) return;
      delete ee.wsIde.files[fileKey];
      updateFileList();
      ee.wsIde.loadFile(ee.wsIde.defaultFile);
    }

  };
  $(self.init);

  return self;
})();


