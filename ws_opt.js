var ws_opt = (function() {
  LabelPlaceholder = function(labels) {
    this.labels = labels;
  }

  var labelRef = function(labelMap, labels, ref) {
    for (var l in labels) {
      labelMap[labels[l]] = ref;
    }
  };

  var makePiece = function (stack, continues) {
    return {
      reachable: false,
      continues: continues, // will continue after last statement
      continued: false, // continued from last piece
      recursion: false,
      innerLoop: false,
      calledFrom: {},
      jumpedFrom: {},
      callsTo: {},
      jumpsTo: {},
      stack: stack
    };
  };

  var shredProgram = function(prog) {
    var labelMap = {"$": 0};
    var pieces = [];
    var currentStack = []
    var ignorePieceEnd = false;
    for (var pp in prog.programStack) {
      var inst = prog.programStack[pp];
      if (inst.labels) {
        if (currentStack.length > 0) {
          pieces.push(makePiece(currentStack, !ignorePieceEnd));
          currentStack = [];
          ignorePieceEnd = false;
        }
        labelRef(labelMap, inst.labels, pieces.length);
      }
      if (!ignorePieceEnd) {
        currentStack.push(inst);
        if (inst instanceof ws.WsJump || inst instanceof ws.WsEndProgram || inst instanceof ws.WsReturn) {
          ignorePieceEnd = true;
        }
      }
     
    }
    pieces.push(makePiece(currentStack, !ignorePieceEnd));
    return {
      labelMap: labelMap,
      pieces: pieces
    };
  };

  var analyzePieces = function(shred) {
    for (var pieceNr in shred.pieces) {
      pieceNr = parseInt(pieceNr);
      var piece = shred.pieces[pieceNr];
      for (var ip in piece.stack) {
        var inst = piece.stack[ip];
        if (inst instanceof ws.WsJump || inst instanceof ws.WsJumpZ || inst instanceof ws.WsJumpNeg || inst instanceof ws.WsCall) {
          var target = shred.labelMap[inst.param.token];
          if (typeof target == "undefined") {
            throw "Undefined target in piece " + pieceNr;
          }
          if (target != pieceNr) {
            if (inst instanceof ws.WsCall) {
              shred.pieces[target].calledFrom[pieceNr] = (shred.pieces[target].calledFrom[pieceNr] || 0) + 1;
              piece.callsTo[target] = true;
            } else {
              shred.pieces[target].jumpedFrom[pieceNr] = (shred.pieces[target].jumpedFrom[pieceNr] || 0) + 1;
              piece.jumpsTo[target] = true;
            }
          } else {
            if (inst instanceof ws.WsCall) {
              piece.recursion = true;
            } else { 
              piece.innerLoop = true;
            }
          }
        }
      }
      if (pieceNr == 0) {
        piece.continued = true;
      }
      if (piece.continues && (pieceNr + 1) in shred.pieces) {
        shred.pieces[pieceNr + 1].continued = true;
      }
    }
    return shred;
  };

  var filterPieces = function(shred) {
    var reachables = [0];

    while (reachables.length > 0) {
      var pieceNr = parseInt(reachables.shift());
      var piece = shred.pieces[pieceNr];
      if (piece.reachable) continue;
      piece.reachable = true;

      if (piece.continues) reachables.push(pieceNr + 1);

      var targets = Object.keys(piece.callsTo).concat(Object.keys(piece.jumpsTo));
      for (var t in targets) {
        reachables.push(targets[t]);
      }
    }
  }

  var unifyPieces = function(shred) {
    for (var pieceNr = shred.pieces.length - 1; pieceNr >= 0; pieceNr--) {
      pieceNr = parseInt(pieceNr);
      var piece = shred.pieces[pieceNr];
      if (Object.keys(piece.jumpedFrom).length == 1 && 
          Object.keys(piece.calledFrom).length == 0 && 
          (!piece.continued || ((pieceNr -1) in piece.jumpedFrom))
      ) {
        var parentPieceNr = Object.keys(piece.jumpedFrom).shift();
        var parentPiece = shred.pieces[parentPieceNr];
        parentPiece.stack = parentPiece.stack.concat(piece.stack);
        delete parentPiece.jumpsTo[pieceNr];
        piece.reachable = false; // code block is deprecated
        for (var tmp in shred.pieces) {
          var tmpPiece = shred.pieces[tmp];
          if (pieceNr in tmpPiece.jumpedFrom) {
            var count = tmpPiece.jumpedFrom[pieceNr];
            delete tmpPiece.jumpedFrom[pieceNr];
            tmpPiece.jumpedFrom[parentPiece] = (tmpPiece.jumpedFrom[parentPiece] || 0) + count;
          }
          if (pieceNr in tmpPiece.calledFrom) {
            var count = tmpPiece.calledFrom[pieceNr];
            delete tmpPiece.calledFrom[pieceNr];
            tmpPiece.calledFrom[parentPiece] = (tmpPiece.calledFrom[parentPiece] || 0) + count;
          }
        }
        parentPiece.innerLoop = parentPiece.innerLoop || piece.innerLoop || parentPieceNr in piece.jumpsTo;
        parentPiece.recursion = parentPiece.recursion || piece.recursion || parentPieceNr in piece.callsTo
      }
    }
  }

  var pushPiece = function(builder, piece) {
    if (piece.done) return; // inlining
    if (!piece.reachable) return; // unreachable code
    for (var iNr in piece.stack) {
      var inst = piece.stack[iNr];
      if (inst instanceof LabelPlaceholder) {
        builder.pendingLabels = builder.pendingLabels.concat(inst.labels);
        continue;
      }

      if (builder.pendingLabels.length > 0) {
        inst.labels = inst.labels || [];
        inst.labels = inst.labels.concat(builder.pendingLabels);
        builder.pendingLabels = [];
      }
      builder.pushInstruction(piece.stack[iNr]);
    }
  }

  var reassemble = function(shred) {
    var builder = ws.programBuilder();
    builder.pendingLabels = [];
    for (var pieceNr in shred.pieces) {
       pieceNr = parseInt(pieceNr);
       var piece = shred.pieces[pieceNr];
       pushPiece(builder, piece);
    }
    if (builder.pendingLabels.length > 0) {
      var endInst = new ws.WsEndProgram();
      endInst.labels = builder.pendingLabels;
      builder.pushInstruction(endInst);
    }
    delete builder.pendingLabels;

    builder.postProcess();
    return builder;
  };

  var getTarget = function(inst, shred) {
    return shred.pieces[shred.labelMap[inst.param.token]];
  }

  var inlinePiece = function(piece, shred) {
    if (!piece.reachable) return;
    if (piece.processing) return;
    piece.processing = true;

    var newStack = [];
    for (iNr in piece.stack) {
      var pushInst = true;
      var inst = piece.stack[iNr];
      if (inst instanceof ws.WsJump) {
        var target = getTarget(inst, shred); 
        if (!target.continued && Object.keys(target.jumpedFrom).length == 1 && target.jumpedFrom[Object.keys(target.jumpedFrom).shift()] == 1) {
          inlinePiece(target, shred);
          newStack = newStack.concat(target.stack);
          target.reachable = false; // this piece is deprecated
          pushInst = false;
        } 
      } else if (inst instanceof ws.WsCall) {
        var target = getTarget(inst, shred);
        if (!target.continued && 
            Object.keys(target.jumpedFrom).length == 0 && 
            Object.keys(target.calledFrom).length == 1 && 
            target.calledFrom[Object.keys(target.calledFrom).shift()] == 1 &&
            !target.recursion // TODO! recursion messes up a lot 
           ) {
          inlinePiece(target, shred);
          for (var i in target.stack) {
            var targetInst = target.stack[i];
            if (!(targetInst instanceof ws.WsReturn)) { // skip all returns
              newStack.push(targetInst);
            } else if ((targetInst.labels || []).length > 0) {
               newStack.push(new LabelPlaceholder(targetInst.labels));
            } else if (parseInt(i)+1 != target.stack.length) {
              console.warn("Probably corrupted optimization!");
            }
          }
          target.reachable = false; // mark code block as deprecated
          pushInst = false;
        } 
      } 
      if (pushInst) {
        newStack.push(inst);
      }
    }
    piece.stack = newStack;
    piece.processing = false;
  }

  var inlineShred = function(shred) {
    for (var pieceNr in shred.pieces) {
      var piece = shred.pieces[pieceNr];
      inlinePiece(piece, shred);
    }
  }

  var reduceLabels = function(prog) {
    var refCount = {};
    for (var iNr in prog.programStack) {
      var inst = prog.programStack[iNr];
      if (inst instanceof ws.WsCall || 
          inst instanceof ws.WsJump ||
          inst instanceof ws.WsJumpZ ||
          inst instanceof ws.WsJumpNeg
      ) {
        var ref = prog.labels[inst.param.token];
        refCount[ref] = (refCount[ref] || 0) + 1
      }
    }

    var orderRef = [];
    for (var iNr in refCount) {
      orderRef.push({ iNr: iNr, count: refCount[iNr]});
    }

    orderRef = orderRef.sort(function (a,b) { return b.count - a.count; });
    
    var refLabel = {};
    for (var i in orderRef) {
      refLabel[orderRef[i].iNr] = ws_util.getWsUnsignedNumber(i);
    }

    for (var iNr in prog.programStack) {
      var inst = prog.programStack[iNr];
      inst.labels = [];
      if (iNr in refLabel) {
        inst.labels.push(refLabel[iNr]);
      }

      if (inst instanceof ws.WsCall || inst instanceof ws.WsJump || inst instanceof ws.WsJumpZ || inst instanceof ws.WsJumpNeg) {
        inst.param.token = refLabel[prog.labels[inst.param.token]];
      }
    }

    prog.labels = {};
    for (var i in refLabel) {
      prog.labels[refLabel[i]] = i;
    }
  }

  var self = {
    _shred: function(prog) {
      return shredProgram(prog);
    },

    _analyze: function(prog) {
      return analyzePieces(shredProgram(prog));
    },

    optimize: function(prog) {
      var shrd = shredProgram(prog);
      analyzePieces(shrd);
      filterPieces(shrd);
      unifyPieces(shrd);
      inlineShred(shrd);
      var optProg = reassemble(shrd);

      reduceLabels(optProg);

      return optProg;
    }
  };
  return self;
})();
