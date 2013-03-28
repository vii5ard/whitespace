var ee;
ee = ee || {};
var console = (function () {
  var writeTab = function (msg) {
    var consoleArea = $('#consoleArea');
    consoleArea.append('<div>' + msg + '<div>');
    consoleArea.scrollTop(consoleArea[0].scrollHeight);
    ws_util.handleOverflow(consoleArea);
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
    if (ee.wsIde.highlightEnabled) {
      overlay = ee.wsIde.highlightSource(src);
    }
    srcOverlay.html(overlay);

    var pre = $('#srcHiddenDiv');
    pre.html(src);
  
    srcInput.width(pre.width() + 30 );
    srcInput.height(pre.height() + 30);
    srcOverlay.css('top', -srcInput.height());
    $('#inputContainer').height(srcInput.height()); 
  };

  var compileProgram = function() {
    var src = programSource();
    ee.wsIde.program = ws.compile(src);
    var panel = $('#panelRight .content');
    panel.html(ee.wsIde.program.getAsmSrc());
    ws_util.handleOverflow(panel);
  };

  var updateEditor = function() {
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
  }

  var self = {
    examples: [],
    inputStream: '',
    inputStreamPtr: 0,
    highlightSource: function(src) {
      return src.replace(/[^\t\n ]/g, '#')
                .replace(/([ ]+)/g, '<span class="spaces">\$1</span>')
                .replace(/(\t+)/g, '<span class="tabs">\$1</span>')
                .replace(/#/g,' ');
    
    },
    
    init: function() {
      $('#srcInput').keyup(updateEditor);
      $('#srcInput').change(updateEditor);
      $('#srcInput').keydown(function(e){
        var ret=interceptTabs(e, this);
        updateEditor();
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
      ee.wsIde.env = env;
      return env;
    },

    loadSource: function(src) {
      return $('#srcInput').val(src);
    },

    loadExample: function(idx) {
      if (!ee.wsIde.examples[idx]) return;
      var url = ee.wsIde.examples[idx].file;
      if (url.match(/\.ws$/)) {
        this.setHighlight(true);
      } else {
        this.setHighlight(false);
      } 
      $.get(url, function(src) {
        ee.wsIde.loadSource(src);
        updateEditor();
        $('#panelMiddleLabel span').html(url);
      });
    },

    initExamples: function () {
      $.getJSON('example/meta.json', function(result) {
        ee.wsIde.examples = result.examples;
        var fileList = $('#fileList');
        for(var i=0; i<ee.wsIde.examples.length; i++) {
          var ex = ee.wsIde.examples[i];
          var line = $('<div></div>');
          line.addClass('fileEntry');
          line.addClass('fileTypeAsm');
          var link = $('<a href="javascript: void(0);" onClick="ee.wsIde.loadExample(' + i + ');"></a>')
          link.html(ex.name);
          link.appendTo(line);
          line.appendTo(fileList);
        }
        ee.wsIde.loadExample(0);
      });

    },

    runProgram: function() {
      try {
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
          return;
        } else if (err != "Break") {
          console.error("Runtime Error: " + err);
        }
        ee.wsIde.env.running = false;
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
      link.closest(".btn").addClass("activeTab");

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

    updateMemoryTab: function () {
      $('#stackSpan').html('[' + this.env.stack.slice(0,this.env.register.SP).join(', ') + ']');
      var heapArr = [];
      for (i in this.env.heap) {
        heapArr.push(i + ':' + this.env.heap[i]);
      }
      $('#heapSpan').html('{\t' + heapArr.join(',\t') + '}');
    }
  };
  $(self.init);

  return self;
})();


