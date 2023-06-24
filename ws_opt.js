globalThis.ws_opt = (function() {
  const LabelPlaceholder = function (labels) {
    this.labels = labels;
  };

  const labelRef = function (labelMap, labels, ref) {
    for (const label of labels) {
      labelMap[label] = ref;
    }
  };

  const makePiece = function (stack, continues) {
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

  const shredProgram = function (prog) {
    const labelMap = {"$": 0};
    const pieces = [];
    let currentStack = [];
    let ignorePieceEnd = false;
    for (const inst of prog.programStack) {
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
      builder: prog,
      labelMap: labelMap,
      pieces: pieces
    };
  };

  const analyzePieces = function (shred) {
    for (let pieceNr in shred.pieces) {
      pieceNr = parseInt(pieceNr);
      const piece = shred.pieces[pieceNr];
      for (const inst of piece.stack) {
        if (inst instanceof ws.WsJump || inst instanceof ws.WsJumpZ || inst instanceof ws.WsJumpNeg || inst instanceof ws.WsCall) {
          const target = shred.labelMap[inst.param.token];
          if (typeof target === "undefined") {
            throw "Undefined target in piece " + pieceNr;
          }
          if (target !== pieceNr) {
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
      if (pieceNr === 0) {
        piece.continued = true;
      }
      if (piece.continues && (pieceNr + 1) in shred.pieces) {
        shred.pieces[pieceNr + 1].continued = true;
        piece.jumpsTo[pieceNr + 1] = (piece.jumpsTo[pieceNr + 1] || 0) + 1;
        shred.pieces[pieceNr + 1].jumpedFrom[pieceNr] = (shred.pieces[pieceNr + 1].jumpedFrom[pieceNr] || 0) + 1;
      }
    }

    shred.pieces[shred.pieces.length - 1].continues = false; // In case the last piece does not end properly
    return shred;
  };

  const filterPieces = function (shred) {
    const reachables = [0];

    while (reachables.length > 0) {
      const pieceNr = parseInt(reachables.shift());
      const piece = shred.pieces[pieceNr];
      if (piece.reachable) continue;
      piece.reachable = true;

      if (piece.continues) {
        reachables.push(pieceNr + 1);
      }

      const targets = Object.keys(piece.callsTo).concat(Object.keys(piece.jumpsTo));
      for (const target of targets) {
        reachables.push(target);
      }
    }
  };

  const pushPiece = function (builder, piece) {
    if (piece.done) return; // inlining
    if (!piece.reachable) return; // unreachable code
    for (const inst of piece.stack) {
      if (inst instanceof LabelPlaceholder) {
        builder.pendingLabels = builder.pendingLabels.concat(inst.labels);
        continue;
      }

      if (builder.pendingLabels.length > 0) {
        inst.labels = inst.labels || [];
        inst.labels = inst.labels.concat(builder.pendingLabels);
        builder.pendingLabels = [];
      }
      builder.pushInstruction(inst);
    }
  };

  const reassemble = function (shred) {
    const builder = ws.programBuilder();
    builder.pendingLabels = [];
    for (let pieceNr in shred.pieces) {
      pieceNr = parseInt(pieceNr);
      const piece = shred.pieces[pieceNr];
      pushPiece(builder, piece);
    }
    if (builder.pendingLabels.length > 0) {
      const endInst = new ws.WsEndProgram();
      endInst.labels = builder.pendingLabels;
      builder.pushInstruction(endInst);
    }
    delete builder.pendingLabels;

    builder.postProcess();
    return builder;
  };

  const getTarget = function (inst, shred) {
    return shred.pieces[shred.labelMap[inst.param.token]];
  };

  const inlinePiece = function (piece, shred) {
    if (!piece.reachable) return;
    if (piece.processing) return;
    piece.processing = true;

    const newStack = [];
    for (const iNr in piece.stack) {
      let pushInst = true;
      const inst = piece.stack[iNr];
      if (inst instanceof ws.WsJump) {
        const target = getTarget(inst, shred);
        if (!target.continued &&
            !target.continues &&
            Object.keys(target.jumpedFrom).length === 1 &&
            target.jumpedFrom[Object.keys(target.jumpedFrom).shift()] === 1
        ) {
          inlinePiece(target, shred);
          newStack.push(...target.stack);
          target.reachable = false; // this piece is deprecated
          pushInst = false;
        }
      } else if (inst instanceof ws.WsCall) {
        const target = getTarget(inst, shred);
        if (!target.continued &&
            !target.continues &&
            Object.keys(target.jumpedFrom).length === 0 &&
            Object.keys(target.calledFrom).length === 1 &&
            target.calledFrom[Object.keys(target.calledFrom).shift()] === 1 &&
            !target.recursion // TODO! recursion messes up a lot
        ) {
          inlinePiece(target, shred);

          let retLabel = null;

          for (const i in target.stack) {
            const targetInst = target.stack[i];
            if (!(targetInst instanceof ws.WsReturn)) { // skip all returns
              newStack.push(targetInst);
            } else if ((targetInst.labels || []).length > 0) {
              newStack.push(new LabelPlaceholder(targetInst.labels));
            } else if (parseInt(i) + 1 !== target.stack.length) {
              if (!retLabel) {
                let tmp = 0n;
                while (true) {
                  retLabel = ws_util.getWsUnsignedNumber(tmp++);
                  if (!(retLabel in shred.builder.labels)) {
                    shred.builder.labels[retLabel] = -1; // DANGER: hack alert!
                    break;
                  }
                }
              }
              const jmpInst = new ws.WsJump();
              jmpInst.param = {token: retLabel};
              newStack.push(jmpInst);
            }
          }
          if (retLabel) {
            newStack.push(new LabelPlaceholder(retLabel));
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
  };

  const inlineShred = function (shred) {
    for (const piece of shred.pieces) {
      inlinePiece(piece, shred);
    }
  };

  const reduceLabels = function (prog) {
    const refCount = {};
    for (const inst of prog.programStack) {
      if (inst instanceof ws.WsCall ||
          inst instanceof ws.WsJump ||
          inst instanceof ws.WsJumpZ ||
          inst instanceof ws.WsJumpNeg
      ) {
        const ref = prog.labels[inst.param.token];
        refCount[ref] = (refCount[ref] || 0n) + 1n
      }
    }

    let orderRef = [];
    for (const iNr in refCount) {
      orderRef.push({iNr: iNr, count: refCount[iNr]});
    }

    orderRef = orderRef.sort(function (a, b) {
      return Number(b.count - a.count);
    });

    const refLabel = {};
    for (const i in orderRef) {
      refLabel[orderRef[i].iNr] = ws_util.getWsUnsignedNumber(BigInt(i));
    }

    for (const iNr in prog.programStack) {
      const inst = prog.programStack[iNr];
      inst.labels = [];
      if (iNr in refLabel) {
        inst.labels.push(refLabel[iNr]);
      }

      if (inst instanceof ws.WsCall || inst instanceof ws.WsJump || inst instanceof ws.WsJumpZ || inst instanceof ws.WsJumpNeg) {
        inst.param.token = refLabel[prog.labels[inst.param.token]];
      }
    }

    prog.labels = {};
    for (const i in refLabel) {
      prog.labels[refLabel[i]] = i;
    }
  };

  return {
    _shred: function (prog) {
      return shredProgram(prog);
    },

    _analyze: function (prog) {
      return analyzePieces(shredProgram(prog));
    },

    optimize: function (prog) {
      const shrd = shredProgram(prog);
      analyzePieces(shrd);
      filterPieces(shrd);
//      inlineShred(shrd);
      const optProg = reassemble(shrd);

      reduceLabels(optProg);

      return optProg;
    }
  };
})();
