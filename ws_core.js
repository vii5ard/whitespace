(function() {

  /* 
   * Private interface
   */
  var Heap = function () {
    var heapSpace = {};
    return {
      store: function (addr, val) {
        if (typeof addr == "undefined" || typeof val == "undefined") {
          throw "Heap store invoked with undefined address or value";
        }
        heapSpace[addr] = val;
        return val;
      },
      retrieve: function (addr) {
        var val = heapSpace[addr];
        if (typeof val == "undefined") {
          return this.store(addr, 0);
        }
        return val;
      },
      toArray: function() {
        return heapSpace;
      }
    }
  }

  var sourceTokens = {' ':true, '\n': true, '\t':true};

  var isSource = function(token) {
    return sourceTokens[token];
  };

  var parseParam = function(tokenizer) {
    var sign = 0;
    var value = 0;
    var paramStr = '';
    while (tokenizer.hasNext()) {
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

  /*
   * Public interface
   */
ws = {
  env: function () {
    var self = {
      register: {IP:0, SP:0 },
      stack: [],
      heap: new Heap(),
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
    var builder = ws.programBuilder(fullSource);
    var parser = instParser;
    var tokenizer = new ws_util.StrArr(fullSource);
 
    var debugToken = '';
    while (tokenizer.hasNext()) {
      var token = tokenizer.getNext();
      if (!sourceTokens[token]) {
        continue;
      }
      debugToken += {' ': 's', '\t':'t', '\n':'n'}[token]
      parser = parser.cont[token];
      if (!parser) {
        throw {
          program: builder,
          message: 'Unexpected token at line ' + tokenizer.line + ':' + tokenizer.col + ' - ' + debugToken
        }
      }
      if (parser.instFn) {
        var instruction = new parser.instFn();
        if (instruction.paramType != null) {
          instruction.param = parseParam(tokenizer);
          if (!instruction.param.token) {
            throw {
              program: builder,
              message: 'Unexpected EOF'
            };
          }
        }
        builder.pushInstruction(instruction);
       // Reset parser
        parser = instParser;
        debugToken='';
      }
    }

    if (debugToken) {
      throw {
        program: builder,
        message: 'Unexpected EOF'
      };
    }

    builder.postProcess();

    for (label in builder.labels) {
      var inst = builder.programStack[builder.labels[label]];
      if (!inst.labels) inst.labels = [];
      inst.labels.push(label);
    }
    return builder;
  },

  programBuilder: function (fullSource) {
    return {
      source: fullSource,
      programStack: [],
      labels: {},
      asmLabels: {},
      getAsm: function () {
        var asm = [];
        for (var i in this.programStack) {
          var inst = this.programStack[i];
          asm.push(inst.getAsm());
        }
        return asm;
      },

      pushInstruction: function (instruction) {
        if (instruction.apply) {
          instruction.apply(this);
        } else {
          instruction.address = this.programStack.length;
          this.programStack.push(instruction);
        }
      },

      postProcess: function () {
        for (var i in this.programStack) {
          if (this.programStack[i].postProcess) {
            this.programStack[i].postProcess(this);
          }
        }
      },

      getAsmSrc: function () {
        var src = [];
        var asm = this.getAsm();
        var labler = new ws_util.labelTransformer(function (n, label) { return "label_" + n; } );
        for (var i in asm) {
          var ln = asm[i];
          var labels = "";
          for (l in ln.labels) {
            var wsLabel = ln.labels[l];
            var label = this.asmLabels[wsLabel] || labler.getLabel(wsLabel);
            labels += (labels ? "\n": "") + label + ":";
          }
          if (labels) {
            src.push({IP: null, str: labels});
          }
          var instrStr = ln.mnemo;
          if (ln.param.label != null) {
            instrStr += " " + (this.asmLabels[ln.param.label] || labler.getLabel(ln.param.label));
          }
          if (ln.param.val != null) {
            instrStr += " " + ln.param.val;
          }
          src.push({IP:i, str: instrStr});
        }
       
        return src;
      },
      getWsSrc: function () {
        var src = '';
        for (var i in this.programStack) {
          var inst = this.programStack[i];
          for (l in inst.labels) {
            src += '\n  ' + inst.labels[l];
          }
          src += inst.wsToken;
          var par = inst.param;
          if (par) {
            src += par.token;
          }   
        }   
        return src;
      }
    };
  },
 
 
  /* 
   * Stack manipulation object constructors
   */

  WsPush: function() {
    this.run = function (env) {
      env.stackPush(this.param.value);
      env.register.IP++;
    };
    this.getAsm = asmWithValueParam;
  },

  WsDouble: function() {
    this.run = function(env) {
      env.stackPush(env.stack[env.register.SP-1]);
      env.register.IP++;
    }
    this.getAsm = asmWithNoParam;
  },

  WsCopyNth: function() {
    this.run = function (env) {
      var actualPos = env.register.SP - this.param.value - 1;
      env.stackPush(env.stack[actualPos]);
      env.register.IP++;
    }
    this.getAsm = asmWithValueParam;
  },
    
  WsSwapTop: function() {
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
    this.run = function (env) {
      env.register.SP--;
      env.register.IP++;
    }
    this.getAsm = asmWithNoParam;
  },

  WsSlide: function() {
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
    this.run = function(env) {
      var b = env.stackPop();
      var a = env.stackPop();
      env.stackPush(a+b);
      env.register.IP++;
    }
    this.getAsm = asmWithNoParam;
  },

  WsSubtraction: function() {
    this.run = function(env) {
      var b = env.stackPop();
      var a = env.stackPop();
      env.stackPush(a-b);
      env.register.IP++;
    };
    this.getAsm = asmWithNoParam;
  },

  WsMultiplication: function() {
    this.run = function(env) {
      var b = env.stackPop();
      var a = env.stackPop();
      env.stackPush(a*b);
      env.register.IP++;
    };
    this.getAsm = asmWithNoParam;
  },

  WsIntDivision: function() {
    this.run = function (env) {
      var b = env.stackPop();
      var a = env.stackPop();
      env.stackPush(Math.floor(a/b));
      env.register.IP++;
    };
    this.getAsm = asmWithNoParam;
  },

  WsModulo: function() {
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
    this.run = function (env) {
      var value = env.stackPop();
      var addr = env.stackPop();
      env.heap.store(addr, value);
      env.register.IP++;
    };
    this.getAsm = asmWithNoParam;
  },

  WsHeapRetrieve: function() {
    this.run = function(env) {
      var addr = env.stackPop();
      env.stackPush(env.heap.retrieve(addr));
      env.register.IP++;
    };
    this.getAsm = asmWithNoParam;
  },
    
  /*
   * Flowcontrol
   */
  WsLabel: function() {
    this.apply = function(compiler) {
      compiler.labels[this.param.token] = compiler.programStack.length;
    };
  },

  WsEndProgram: function() {
    this.run = function(env) {
      throw "END";
    };
    this.getAsm = asmWithNoParam;
  },

  WsPrintNum: function() {
    this.run = function(env) {
      var num = env.stackPop();
      env.print(num);
      env.register.IP++;
    };
    this.getAsm = asmWithNoParam;
  },

  WsPrintChar: function() {
    this.run = function(env) {
      var ch = env.stackPop();
      env.print(String.fromCharCode(ch));
      env.register.IP++;
    };
    this.getAsm = asmWithNoParam;
  },

  WsCall: function() {
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
    this.run = function(env) {
      env.register.IP = this.nextI;
    };
    this.postProcess = function(compiler) {
      this.nextI = compiler.labels[this.param.token];
    };
    this.getAsm = asmWithLabelParam;
  },

  WsJumpZ: function() {
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
    this.run = function (env) {
      var top = env.stackPop();
      if (top < 0) {
        env.register.IP = this.successI;
      } else {
        env.register.IP++;
      }
    }
    this.postProcess = function(compiler) {
      this.successI = compiler.labels[this.param.token];
    }
   this.getAsm = asmWithLabelParam;
  },

  WsReturn: function() {
    this.run = function(env) {
      env.closeFrame();
    }
    this.getAsm = asmWithNoParam;
  },

  WsReadNum: function() {
    this.run = function (env) {
      var num = env.readNum();
      var addr = env.stackPop();
      env.heap.store(addr, num);
      env.register.IP++;
    }
    this.getAsm = asmWithNoParam;
  },

  WsReadChar: function() {
    this.run = function (env) {
      var ch = env.readChar();
      var addr = env.stackPop();
      env.heap.store(addr, ch.charCodeAt(0));
      env.register.IP++;
    };
    this.getAsm = asmWithNoParam;
  }
}
ws.keywords = [
    { ws: '  ',       mnemo: 'push',     constr: ws.WsPush,           param: "NUMBER" },
    { ws: ' \n ',     mnemo: 'dup',      constr: ws.WsDouble,         param: null },
    { ws: ' \t ',     mnemo: 'copy',     constr: ws.WsCopyNth,        param: "NUMBER" },
    { ws: ' \n\t',    mnemo: 'swap',     constr: ws.WsSwapTop,        param: null },
    { ws: ' \n\n',    mnemo: 'drop',     constr: ws.WsDropTop,        param: null },
    { ws: ' \t\n',    mnemo: 'slide',    constr: ws.WsSlide,          param: "NUMBER" },
    { ws: '\t   ',    mnemo: 'add',      constr: ws.WsAddition,       param: null },
    { ws: '\t  \t',   mnemo: 'sub',      constr: ws.WsSubtraction,    param: null },
    { ws: '\t  \n',   mnemo: 'mul',      constr: ws.WsMultiplication, param: null },
    { ws: '\t \t ',   mnemo: 'div',      constr: ws.WsIntDivision,    param: null },
    { ws: '\t \t\t',  mnemo: 'mod',      constr: ws.WsModulo,         param: null },
    { ws: '\t\t ',    mnemo: 'store',    constr: ws.WsHeapStore,      param: null },
    { ws: '\t\t\t',   mnemo: 'retrieve', constr: ws.WsHeapRetrieve,   param: null },
    { ws: '\n  ',     mnemo: 'label',    constr: ws.WsLabel,          param: "LABEL" },
    { ws: '\n \t',    mnemo: 'call',     constr: ws.WsCall,           param: "LABEL" },
    { ws: '\n \n',    mnemo: 'jmp',      constr: ws.WsJump,           param: "LABEL" },
    { ws: '\n\t ',    mnemo: 'jz',       constr: ws.WsJumpZ,          param: "LABEL" },
    { ws: '\n\t\t',   mnemo: 'jn',       constr: ws.WsJumpNeg,        param: "LABEL" },
    { ws: '\n\t\n',   mnemo: 'ret',      constr: ws.WsReturn,         param: null },
    { ws: '\n\n\n',   mnemo: 'end',      constr: ws.WsEndProgram,     param: null },
    { ws: '\t\n  ',   mnemo: 'printc',   constr: ws.WsPrintChar,      param: null },
    { ws: '\t\n \t',  mnemo: 'printi',   constr: ws.WsPrintNum,       param: null },
    { ws: '\t\n\t ',  mnemo: 'readc',    constr: ws.WsReadChar,       param: null },
    { ws: '\t\n\t\t', mnemo: 'readi',    constr: ws.WsReadNum,        param: null }
  ];

// Adding aliases for compatibility with other WSA implementations
ws.keywordAliases = {
  'dup':    ['doub', 'duplicate'],
  'jmp':    ['jump'],
  'jz':     ['jumpz'],
  'jn':     ['jumpn'],
  'printc': ['outn', 'putc'],
  'printi': ['outi', 'puti', 'putn'],
  'readc':  ['getc'],
  'readi':  ['geti', 'getn'],
  'push':   ['pushs'], // push string is embedded by default
  'ret':    ['ret'],
  'end':    ['exit', 'halt']
};

  for (var i in ws.keywords) {
    var keyword = ws.keywords[i];
    var constr = keyword.constr;
    constr.prototype.mnemoCode = keyword.mnemo;
    constr.prototype.paramType = keyword.param;
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

  for (var i in ws.keywords) {
    var keyword = ws.keywords[i];
    var constr = keyword.constr;
    instParser.addInstruction(keyword.ws, constr);
  }

})();
