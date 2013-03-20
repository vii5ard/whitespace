(function() {
  /*
   * Private interface
   */
  var genSource = function(program) {
    var src = '';
    for (var i in program.programStack) {
      var inst = program.programStack[i];
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

  var genProgram = function(tree) {
    var done = [];
    var todo = [tree];
    var programStack = [];
    var labels = [];

    while (todo.length > 0) {
      var inst = todo.shift();
      while (inst) {
        if (done.indexOf(inst) in done) break;
        done.push(inst);

        if (inst.branch) {
          inst.param.token=inst.branch.labels[0];
        } else if (inst instanceof ws.WsJump) {
          inst.param.token=inst.next.labels[0];
        }

        var sp = programStack.push(inst);
        for (var l in inst.labels) {
          labels[inst.labels[l]] = sp;
        }

        if (inst.branch) {
          todo.push(inst.branch);
        }

        inst = inst.next;
      }
    }

    return {programStack:programStack, labels:labels};
  }

  var markReachable = function(program, initSp) {
    var sp = initSp
    while (sp in program.programStack) {
      var inst = program.programStack[sp];
      if (inst.reachable) break;
      inst.reachable = true;
      if (inst instanceof ws.WsEndProgram || inst instanceof ws.WsReturn) break;

      if (isFlowcontrol(inst)) {
        markReachable(program, program.labels[inst.param.token]);
      }

      sp++;
    }
  }

  var removeUnreachable = function(program) {
    markReachable(program, 0);
    var programStack = program.programStack;
    for (sp in programStack) {
      if (!programStack[sp].reachable) delete programStack[sp];
    }
  }

  var createLabel = function(number) {
    var label = '';

    while (number > 0) {
      label += number % 2 ? ' ' : '\t';
      number >>= 1;
    }

    label += '\n';
    return label;
  }

  var getOptimalLabels = function(labelCounter) {
    var labelData = [];
    for (label in labelCounter) {
      labelData.push({label: label, count: labelCounter[label]});
    }

    labelData.sort(function (a,b) {
      return b.count - a.count;
    });

    var optimalLabels = [];
    for (var i in labelData) {
      optimalLabels[labelData[i].label] = createLabel(i+1);
    }

    return optimalLabels;

  }

  var isFlowcontrol = function(inst) {
    return inst instanceof ws.WsJump || inst instanceof ws.WsCall || inst instanceof ws.WsJumpZ || inst instanceof ws.WsJumpNeg;
  }

  var reduceLabels1 = function(program) {
    var programStack = program.programStack;
    var labelCounter = [];
    for (var sp in programStack) {
      var inst = programStack[sp];
      if (isFlowcontrol(inst)) {
        var label = inst.param.token;
        if (label in labelCounter) {
          labelCounter[label]++;
        } else {
          labelCounter[label] = 1;
        }
      }
    }

    var optimalLabels = getOptimalLabels(labelCounter);

    for (var sp in programStack) {
      var inst = programStack[sp];
      for (var lp in inst.labels) {
        var label = inst.labels[lp];
        if (label in labelCounter) {
          var optLabel = optimalLabels[label];
          inst.labels[lp] = optLabel;
          program.labels[optLabel] = program.labels[label];
        } else {
          delete inst.labels[lp];
          delete program.labels[label];
        }
      }

      if (isFlowcontrol(inst)) {
        inst.param.token = optimalLabels[inst.param.token];
      }
    }
  }

  genTreeStat = function (tree, jumpToCountInc, callToCountInc) {
    var generator = function (tree, jumpToCountInc, callToCountInc) {
      if (tree) {
        tree.stat = tree.stat || {};
        tree.stat.jumpCnt = (tree.stat.jumpCnt || 0) + jumpToCountInc;
        tree.stat.callCnt = (tree.stat.callCnt || 0) + callToCountInc;

        if (tree.done) return;
        else tree.done = true;

        if (tree.next) generator(tree.next, 1, 0);
        if (tree.branch) {
          if (tree instanceof ws.WsCall) {
            generator(tree.branch, 0, 1);
          } else {
            generator(tree.branch, 1, 0);
          }
        }
      }
    }
    var jumpToCountInc = jumpToCountInc || 1;
    var callToCountInc = callToCountInc || 0;
    
    generator(tree, jumpToCountInc, callToCountInc);

    doneCleanup(tree);
  }

  parseTree = function(program) {
    for (var sp in program.programStack) {
      var inst = program.programStack[sp];
      var nextSP = null;
      if (inst instanceof ws.WsEndProgram || inst instanceof ws.WsReturn) {
        inst.next = null;
      } else if (inst instanceof ws.WsJump) {
        inst.next = program.programStack[inst.nextI];
      } else {
        var nextSP = 1*sp + 1;
        if (nextSP in program.programStack) {
          inst.next = program.programStack[nextSP];
        } else {
          inst.next = null;
        }
      }

      if (inst instanceof ws.WsJumpNeg || inst instanceof ws.WsJumpZ) {
        inst.branch = program.programStack[program.labels[inst.param.token]];
      }

      if (inst instanceof ws.WsCall) {
        inst.branch = program.programStack[program.labels[inst.param.token]];
      }
    }

    return program.programStack[0];
  }

  var hasJumps = function(tree) {
    if (!tree) return false;
    if (tree instanceof ws.WsReturn ||
        tree instanceof ws.WsEndProgram) return false;
    if (tree instanceof ws.WsJump || 
        tree instanceof ws.WsJumpZ || 
        tree instanceof ws.WsJumpNeg) return true;
    
    return hasJumps(tree.next) || hasJumps(tree.branch);
  }

  var doneCleanup = function(tree) {
    if (tree.done) {
      tree.done = false;
      if (tree.branch) doneCleanup(tree.branch);
      if (tree.next) doneCleanup(tree.next);
    } 
  }

  var count

  var reduceJump = function(tree) {
    var reducer = function (tree) {
      if (tree.done) return tree;
      tree.done = true;

      if (tree instanceof ws.WsJump &&
        tree.next &&
        tree.next.stat.jumpCnt == 1) {
        return reduceJump(tree.next);
      } 
      if (tree.branch) tree.branch = reducer(tree.branch);
      if (tree.next) tree.next = reducer(tree.next);
      return tree;
    }
    genTreeStat(tree);

    var newTree = reducer(tree);
    doneCleanup(newTree);
    return newTree;
  } 

  var inlineFunctions = function(tree) {
    var todo = [tree];
    var done = [];
    var newTree = tree;
    var prevInst = null;
    genTreeStat(tree);

    while(todo.length > 0) {
      var inst = todo.shift();
     while (inst) {
       if (done.indexOf(inst) in done) break;
       done.push(inst);

       if (inst instanceof ws.WsCall) {
        var a = true;
      } 
        if (inst instanceof ws.WsCall && 
//            inst.branch.stat.jumpCnt == 0 && 
            inst.branch.stat.callCnt == 1)
//            !hasJumps(inst.branch)) 
        {
          var replacementInst = null;
          if (inst.branch instanceof ws.WsReturn) {
            replacementInst = inst.next;
          } else {
            replacementInst = inst.branch;
            var fn = genProgram(inst.branch);
            
            last = fn.programStack.pop();
            if (last instanceof ws.WsReturn) {
              fn.programStack[fn.programStack.length-1].next = inst.next;
            } else {
              last.next = inst.next;
              fn.programStack.push(last);
            } 
          }

          if (prevInst) {
            prevInst.next = replacementInst;
          } else {
            newTree = replacementInst;
          }
          inst = replacementInst;
        } else {
          if (inst.branch) todo.push(inst.branch);
          prevInst = inst;

          inst = inst.next;
        }
      }
    }
    return newTree;
  }

  reduceLabels = function(tree) {
    var done = [];
    var instSet = []
    var getLabelInstSet = function(tree) {
      var result = [];
      if (!tree || done.indexOf(tree) in done) return;
      done.push(tree);

      if (tree.branch && instSet.indexOf(tree.branch) == -1) {
        instSet.push(tree.branch);
      }
      if (tree instanceof ws.WsJump && instSet.indexOf(tree.next) == -1) {
        instSet.push(tree.next);
      }
      getLabelInstSet(tree.branch);
      getLabelInstSet(tree.next);
    }
    pr = genProgram(tree);
    for (var sp in pr.programStack) {
      pr.programStack[sp].labels=[];
    }
    genTreeStat(tree);
    getLabelInstSet(tree);

    instSet.sort(function (a, b) {
      var bsum = b.stat.jumpCnt + 2*b.stat.callCnt;
      var asum = a.stat.jumpCnt + 2*b.stat.callCnt;
      return bsum - asum;
    });

    for (var i in instSet) {
      instSet[i].labels.push(createLabel(i+1));
    }
  }

  /*
   * Public interface
   */
  ws.reduceProgram = function(program) {
    var tree = parseTree(program);
    tree = inlineFunctions(tree);
    tree = reduceJump(tree);
    reduceLabels(tree);
    var newProgram = genProgram(tree);
    var newSource = genSource(newProgram);
     console.log('Reduced ' + program.source.length + ' bytes to ' + newSource.length + ' bytes (' + 
      Math.round(((program.source.length - newSource.length) / program.source.length) * 100) + 
      '%)');
    return newSource;
    
  }

  ws.reduceProgram1 = function(program) {
    removeUnreachable(program);
    reduceLabels(program);

    var newSource = genSource(program);

    console.log('Reduced ' + program.source.length + ' bytes to ' + newSource.length + ' bytes (' + 
      Math.round(((program.source.length - newSource.length) / program.source.length) * 100) + 
      '%)');
    return newSource;
  }
})();
