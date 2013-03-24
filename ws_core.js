(function() {

  /* 
   * Private interface
   */
  var SourceTokenizer = function(fullSource) {
    var self = {
      source: fullSource.split(''),
      ptr: 0,
      hasMore: function () {
        return this.ptr < this.source.length;
      },
      getNext: function () {
        return this.source[this.ptr++];
      }
    };
    return self;
  };

  var sourceTokens = {' ':true, '\n': true, '\t':true};

  var isSource = function(token) {
    return sourceTokens[token];
  };

  var parseParam = function(tokenizer) {
    var sign = 0;
    var value = 0;
    var paramStr = '';
    while (tokenizer.hasMore()) {
      var token = tokenizer.getNext();
      if (!isSource(token)) continue;
      paramStr += token;
      if (token == '\n') break;
      if (!sign) {
        sign = {' ':1, '\t':-1}[token];
      } else {
        value = (value << 1) + {' ':0, '\t':1}[token];
      }
    }
    return {token: paramStr, value: sign * value};
  };
  var replaceLabelWS = function (label) {
    return label.replace(/ /g,'s').replace(/\t/g,'t');
  }

  var asmObject = function(labels, mnemo, paramVal, paramLabel) {
    var replaceLabels = [];
    for (var i in labels) {
      replaceLabels.push(labels[i]);
    }
    return {
      labels:replaceLabels, 
      mnemo:mnemo, 
      param: {val:paramVal, label:paramLabel}
    };
  }
  
  var asmWithValueParam = function() {
    return asmObject(this.labels, 
                     this.mnemoCode, 
                     this.param.value,
                     null);
  }

  var asmWithLabelParam = function() {
    return asmObject(this.labels, 
                     this.mnemoCode,
                     null, 
                     this.param.token);
  }

  var asmWithNoParam = function () {
    return asmObject(this.labels, this.mnemoCode, null);
  }

  var labelTransformer = function () {
    return {
      length: 0,
      labels: {},
      getLabel: function (wsLabel) {
        if (wsLabel in this.labels) {
          return this.labels[wsLabel];
        } else {
          var label = "label_" + this.length++;
          this.labels[wsLabel] = label;
          return label;
        }
      }
    }
  }

  var programTree = function (fullSource) {
    return {
      source: fullSource,
      parser: instParser,
      tokenizer: SourceTokenizer(fullSource),
      programStack: [],
      labels: [],
      getAsm: function () {
        var asm = [];
        for (var i in this.programStack) {
          var inst = this.programStack[i];
          asm.push(inst.getAsm());
        }
        return asm;
      },
      getAsmSrc: function () {
        var src = "";
        var asm = this.getAsm();
        var labler = labelTransformer();
        var maxLabelLen = 0;
        for (var i in asm) {
          var ln = asm[i];
          for (l in ln.labels) {
            var wsLabel = ln.labels[l];
            var label = labler.getLabel(wsLabel);
            src += label + ":\n";
            maxLabelLen = Math.max(maxLabelLen, label.length);
          }
          src += "\t" + ln.mnemo;
          if (ln.param.label != null) {
            src += " " + labler.getLabel(ln.param.label);
          }
          if (ln.param.val != null) {
            src += " " + ln.param.val;
          }
          src += "\n";
        }
        var tabStr = "";
        if (maxLabelLen) {
          while (maxLabelLen + 1 >= tabStr.length) tabStr += " ";
        }
       
        return src.replace(/\t/g, tabStr);
      }
    };
  }
 
   /*
   * Public interface
   */
ws = {
  env: function () {
    var self = {
      register: {IP:0, SP:0 },
      stack: [],
      heap: [],
      callStack: [],
      running: false,
      paused: true,
      runProgram: function (program) {
        try {
          this.running = true;
          this.paused = false;
          while (this.register.IP < program.programStack.length ) {
            var callable = program.programStack[this.register.IP];
            this.beforeInstructionRun(this);
            callable.run(this);
            this.afterInstructionRun(this);
          }
	} catch (err) {
	  if (err == 'END') {
	     this.running = false;
	  } else if(err == "Break") {
            this.paused = true;
          } else {
	    throw err;
	  }
	}
      },
      stackPush: function (val) {
        this.stack[this.register.SP++] = val;
      },
      stackPop: function () {
        return this.stack[--this.register.SP];
      },
      createFrame: function () {
        this.callStack.push(this.register.IP);
      },
      closeFrame: function () {
        this.register.IP = this.callStack.pop() + 1;
      },
      print: function (s) {
        console.error('Print unimplemented: ' + s); 
      },
      println: function (s) {
        this.print(s + '\n');
      },
      beforeInstructionRun: function (env) {},
      afterInstructionRun: function (env) {}
    };
    return self;
  },

  compile: function (fullSource) {
    var compiler = programTree(fullSource);

var debugToken = '';
    while (compiler.tokenizer.hasMore()) {
      var token = compiler.tokenizer.getNext();
      if (!sourceTokens[token]) {
        continue;
      }
      debugToken += {' ': 's', '\t':'t', '\n':'n'}[token]
      compiler.parser = compiler.parser.cont[token];
      if (!compiler.parser) {
        throw 'Unexpected token @' + compiler.tokenizer.ptr + ':' + debugToken;
      }
      if (compiler.parser.instFn) {
        var instruction = new compiler.parser.instFn();
        if (instruction.hasParam) {
          instruction.param = parseParam(compiler.tokenizer);
        }
        if (instruction.apply) {
          instruction.apply(compiler);
        } else {
          instruction.address = compiler.programStack.length;
          compiler.programStack.push(instruction);
        }
        // Reset parser
        compiler.parser = instParser;
        debugToken='';
      }
    }

    for (var i in compiler.programStack) {
      if (compiler.programStack[i].postProcess) {
        compiler.programStack[i].postProcess(compiler);
      }
    }

    for (label in compiler.labels) {
      var inst = compiler.programStack[compiler.labels[label]];
      if (!inst.labels) inst.labels = [];
      inst.labels.push(label);
    }
    return compiler;
  },

  /* 
   * Stack manipulation object constructors
   */

  WsPush: function() {
    this.mnemoCode = 'push';
    this.hasParam = true;
    this.run = function (env) {
      env.stackPush(this.param.value);
      env.register.IP++;
    };
    this.getAsm = asmWithValueParam;
  },

  WsDouble: function() {
    this.mnemoCode = 'dup';
    this.run = function(env) {
      env.stackPush(env.stack[env.register.SP-1]);
      env.register.IP++;
    }
    this.getAsm = asmWithNoParam;
  },

  WsCopyNth: function() {
    this.mnemoCode = 'copy';
    this.hasParam = true;
    this.run = function (env) {
      var actualPos = this.register.SP - this.param.value;
      env.stackPush(env.stack[actualPos]);
      env.register.IP++;
    }
    this.getAsm = asmWithValueParam;
  },
    
  WsSwapTop: function() {
    this.mnemoCode = 'swap';
    this.run = function (env) {
      var last = env.register.SP - 1;
      var tmp = env.stack[last];
      env.stack[last] = env.stack[last-1];
      env.stack[last-1] = tmp;
      env.register.IP++;
    }
    this.getAsm = asmWithNoParam;
  },

  WsDropTop: function() {
    this.mnemoCode = 'discard';
    this.run = function (env) {
      env.register.SP--;
      env.register.IP++;
    }
    this.getAsm = asmWithNoParam;
  },

  WsSlide: function() {
    this.mnemoCode = 'slide';
    this.hasParam = true;
    this.run = function(env) {
      var top = env.stackPop();
      env.register.SP -= this.param.value;
      env.stackPush(top);
      env.register.IP++;
    }
    this.getAsm = asmWithValueParam;
  },
    
  /*
   * Arithmetic object constructors
   */
    
  WsAddition: function() {
    this.mnemoCode = 'add';
    this.run = function(env) {
      var b = env.stackPop();
      var a = env.stackPop();
      env.stackPush(a+b);
      env.register.IP++;
    }
    this.getAsm = asmWithNoParam;
  },

  WsSubtraction: function() {
    this.mnemoCode = 'sub';
    this.run = function(env) {
      var b = env.stackPop();
      var a = env.stackPop();
      env.stackPush(a-b);
      env.register.IP++;
    };
    this.getAsm = asmWithNoParam;
  },

  WsMultiplication: function() {
    this.mnemoCode = 'mul';
    this.run = function(env) {
      var b = env.stackPop();
      var a = env.stackPop();
      env.stackPush(a*b);
      env.register.IP++;
    };
    this.getAsm = asmWithNoParam;
  },

  WsIntDivision: function() {
    this.mnemoCode = 'div';
    this.run = function (env) {
      var b = env.stackPop();
      var a = env.stackPop();
      env.stackPush(Math.floor(a/b));
      env.register.IP++;
    };
    this.getAsm = asmWithNoParam;
  },

  WsModulo: function() {
    this.mnemoCode = 'mod';
    this.run = function(env) {
     var b = env.stackPop();
     var a = env.stackPop();
     env.stackPush(a%b);
     env.register.IP++;
    };
    this.getAsm = asmWithNoParam;
  },

  /* 
   * Heap operation object constructors
   */
  WsHeapStore: function() {
    this.mnemoCode = 'store';
    this.run = function (env) {
      var value = env.stackPop();
      var addr = env.stackPop();
      env.heap[addr] = value;
      env.register.IP++;
    };
    this.getAsm = asmWithNoParam;
  },

  WsHeapRetrieve: function() {
    this.mnemoCode = 'retrieve';
    this.run = function(env) {
      var addr = env.stackPop();
      env.stackPush(env.heap[addr]);
      env.register.IP++;
    };
    this.getAsm = asmWithNoParam;
  },
    
  /*
   * Flowcontrol
   */
  WsLabel: function() {
    this.hasParam = true;
    this.apply = function(compiler) {
      compiler.labels[this.param.token] = compiler.programStack.length;
    };
  },

  WsEndProgram: function() {
    this.mnemoCode = 'exit';
    this.run = function(env) {
      throw "END";
    };
    this.getAsm = asmWithNoParam;
  },

  WsPrintNum: function() {
    this.mnemoCode = 'outnum';
    this.run = function(env) {
      var num = env.stackPop();
      env.print(num);
      env.register.IP++;
    };
    this.getAsm = asmWithNoParam;
  },

  WsPrintChar: function() {
    this.mnemoCode = 'outchar';
    this.run = function(env) {
      var ch = env.stackPop();
      env.print(String.fromCharCode(ch));
      env.register.IP++;
    };
    this.getAsm = asmWithNoParam;
  },

  WsCall: function() {
    this.mnemoCode = 'call';
    this.hasParam = true;
    this.run = function (env) {
      env.createFrame();
      env.register.IP = this.callableI;
    };
    this.postProcess = function(compiler) {
        this.callableI = compiler.labels[this.param.token];
    };
    this.getAsm = asmWithLabelParam;
  },

  WsJump: function() {
    this.mnemoCode = 'jump';
    this.hasParam=true;
    this.run = function(env) {
      env.register.IP = this.nextI;
    };
    this.postProcess = function(compiler) {
      this.nextI = compiler.labels[this.param.token];
    };
    this.getAsm = asmWithLabelParam;
  },

  WsJumpZ: function() {
    this.mnemoCode = 'jz';
    this.hasParam=true;
    this.run = function(env) {
      var top = env.stackPop();
      if (top == 0) {
        env.register.IP = this.successI;
      } else {
        env.register.IP++;
      }
    };
    this.postProcess = function(compiler) {
      this.successI = compiler.labels[this.param.token];
    };
     this.getAsm = asmWithLabelParam;
  },

  WsJumpNeg: function() {
    this.mnemoCode = 'jn';
    this.useParamToken = true;
    this.hasParam=true;
    this.run = function (env) {
      var top = env.stackPop();
      if (top < 0) {
        env.register.IP = this.successI;
      } else {
        env.register.IP++;
      }
    }
    this.postProcess = function(compiler) {
      this.successI = compiler.labels[this.param];
    }
   this.getAsm = asmWithLabelParam;
  },

  WsReturn: function() {
    this.mnemoCode = 'ret';
    this.run = function(env) {
      env.closeFrame();
    }
    this.getAsm = asmWithNoParam;
  },

  WsReadNum: function() {
    this.mnemoCode = 'readnum';
    this.run = function (env) {
      env.readNum();
      env.register.IP++;
    }
    this.getAsm = asmWithNoParam;
  },

  WsReadChar: function() {
    this.mnemoCode = 'readchar';
    this.run = function (env) {
      var ch = env.readChar();
      var addr = env.stackPop();
      env.heap[addr] = ch.charCodeAt(0);
      env.register.IP++;
    };
    this.getAsm = asmWithNoParam;
  },
  getKeywords: function() {
    return {
      '  ':       ws.WsPush,
      ' \n ':     ws.WsDouble,
      ' \t ':     ws.WsCopyNth,
      ' \n\t':    ws.WsSwapTop,
      ' \n\n':    ws.WsDropTop,
      ' \t\n':    ws.WsSlide,
      '\t   ':    ws.WsAddition,
      '\t  \t':   ws.WsSubtraction,
      '\t  \n':   ws.WsMultiplication,
      '\t \t ':   ws.WsIntDivision,
      '\t \t\t':  ws.WsModulo,
      '\t\t ':    ws.WsHeapStore,
      '\t\t\t':   ws.WsHeapRetrieve,
      '\n  ':     ws.WsLabel,
      '\n \t':    ws.WsCall,
      '\n \n':    ws.WsJump,
      '\n\t ':    ws.WsJumpZ,
      '\n\t\t':   ws.WsJumpNeg,
      '\n\t\n':   ws.WsReturn,
      '\n\n\n':   ws.WsEndProgram,
      '\t\n  ':   ws.WsPrintChar,
      '\t\n \t':  ws.WsPrintNum,
      '\t\n\t ':  ws.WsReadChar,
      '\t\n\t\t': ws.WsReadNum
    };
  }
}

  var InstParser = function() {
    this.instFn = null;
    this.cont = [];
    this.addInstruction = function(keySeqStr, instFn) {
      var instP = this
      var keySeq = keySeqStr.split('');
      for (k in keySeq) {
        var key = keySeq[k]
        if (!(key in instP.cont)) {
          instP.cont[key] = new InstParser(); 
        }
        instP = instP.cont[key];
      }
      instFn.prototype.wsToken = keySeqStr;
      instP.instFn = instFn;
    }
  };
 
  var instParser = new InstParser();

  var keywords = ws.getKeywords();
  for (keyword in keywords) {
    instParser.addInstruction(keyword, keywords[keyword]);
  }



})();
