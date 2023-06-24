globalThis.ws_asm  = (function() {
  const builtinMacros = function () {
    return {
      "include": {
        param: ["STRING"],
        action: function (params, builder) {
          const param = params[1];

          let fileName = param.token;
          fileName = fileName.slice(1, fileName.length - 1);
          if (!(fileName in builder.includes)) {
            const file = ws_fs.getFile(fileName);
            if (!file) {
              throw "File not found: '" + fileName + "'.";
            }

            builder.includes[fileName] = ws_fs.openFile(file);

            if (builder.includes[fileName]) {
              const srcArr = new ws_util.StrArr(builder.includes[fileName]);
              try {
                const ext = ws_asm.compile(builder.includes[fileName], builder);
                builder.externals.push(ext);
              } catch (err) {
                if (err.program) {
                  builder.externals.push(err.program);
                  console.warn("Broken include '" + fileName + "': " + err.message);
                } else {
                  console.error(err);
                  throw "Unknown error loading '" + fileName + "'";
                }
              }
            }
          }
        }
      },
      "macro": {
        param: ["LABEL"],
        action: function (params, builder) {
          const metaTypes = {"$number": "NUMBER", "$label": "TOKEN", "$string": "STRING"};
          const macroLabel = params[1].token.replace(/:$/, "");
          let closed = false;

          const newMacro = {
            tokens: [],
            param: [],
            action: function (params, builder) {
              builder.macroCallCounter = (builder.macroCallCounter || 0) + 1;
              const macroId = builder.macroCallCounter;
              params[0].called = (params[0].called || 0) + 1
              if (params[0].called > 16) {
                throw "Circular reference of macros";
              }

              const toks = [];
              let pp = 1;
              for (const t of this.tokens) {
                const token = Object.assign({}, t);
                if (token.token in metaTypes) {
                  toks.push(params[pp++]);
                } else {
                  if (/^\$\d+$/.test(token.token)) {
                    token.token = ".__" + macroId + "__" + token.token + "__";
                  }
                  toks.push(token);
                }
              }

              builder.tokens = toks.concat(builder.tokens);
            }
          };
          while (true) {
            const token = builder.tokens.shift();
            if (!token) {
              break;
            }
            if (token.type === "MACRO") {
              if (token.token === "$$") {
                closed = true;
                break;
              }
              if (token.token === "include") {
                // do nothing
              } else if (token.token === "$redef") {
                params[1].type = "MACRO";
                newMacro.tokens.push(params[1]);
                continue;
              } else if (token.token in metaTypes) {
                newMacro.param.push(metaTypes[token.token]);
              }
            }
            newMacro.tokens.push(token);
          }
          if (!closed) {
            throw "Macro not closed";
          }

          builder.macros[macroLabel] = newMacro;
        }
      },
      "$$": {
        param: [],
        action: function (params, builder) {
          throw "Unexpected end of macro";
        }
      },
      "$label": {
        param: [],
        action: function (params, builde) {
          throw "Label-pop called outside of a macro";
        }
      },
      "$number": {
        param: [],
        action: function (params, builder) {
          throw "Number-pop called outside of a macro";
        }
      },
      "$string": {
        param: [],
        action: function (params, builder) {
          throw "String-pop called outside of a macro";
        }
      },
      "$redef": {
        param: [],
        action: function (params, builder) {
          throw "Can't redefine macro outside of a macro"
        }
      },
    };
  };

  const mnemo = (function () {
    const mnemoCodes = {};
    // Collect keywords
    for (const keyword of ws.keywords) {
      mnemoCodes[keyword.mnemo] = keyword;
    }

    return mnemoCodes;
  })();

  const parseWhitespace = function (strArr) {
    let space = "";
    while (strArr.hasNext() && /[ \t\n\r]/.test(strArr.peek())) {
      space += strArr.getNext();
    }
    return {
      type: "SPACE",
      token: space
    };
  };

  const parseLineComment = function (strArr) {
    let comment = "";
    do {
      comment += strArr.getNext();
    } while (strArr.hasNext() && strArr.peek() != '\n');
    return {
      type: "COMMENT",
      token: comment
    };
  };

  const parseMultiLineComment = function (strArr) {
    let comment = "";
    do {
      comment += strArr.getNext();
    } while (strArr.hasNext() && !/{-[\s\S]*-}/.test(comment));
    return {
      type: "COMMENT",
      token: comment
    };
  };

  const parseNumber = function (strArr) {
    let numStr = "";
    while (strArr.hasNext() && /^[+-]?\d*$/.test(numStr + strArr.peek())) {
      numStr += strArr.getNext();
    }

    if (strArr.hasNext() && !/\s|\n|;/.test(strArr.peek())) {
      throw "Invalid character in number format";
    }

    try {
      const data = BigInt(numStr);
      return {
        type: "NUMBER",
        token: numStr,
        data: data
      }
    } catch (err) {
      throw "Illegal number";
    }
  };

  const getStringArray = function (str) {
    const arr = str.split('');
    const result = [];
    let escape = false;
    let chCode = "";
    for (let i = 1; i < arr.length - 1; i++) {
      const ch = arr[i];
      if (chCode) {
        if (/[0-9]/.test(ch)) {
          chCode += ch;
          continue;
        } else {
          result.push(BigInt(chCode));
          chCode = "";
        }
      }
      if (escape) {
        if (ch === 'n') {
          result.push(BigInt('\n'.charCodeAt(0)));
        } else if (ch === 't') {
          result.push(BigInt('\t'.charCodeAt(0)));
        } else if (/[0-9]/.test(ch)) {
          chCode += ch;
        } else {
          result.push(BigInt(ch.charCodeAt(0)));
        }
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else {
        result.push(BigInt(ch.charCodeAt(0)));
      }
    }
    if (chCode) {
      result.push(BigInt(chCode));
    }
    if (arr[0] === '"') {
      result.push(0n);
    }
    return result;
  };

  const parseString = function (strArr) {
    const strEnd = strArr.peek();
    let str = strArr.getNext();
    let escape = false;
    while (strArr.hasNext() && (escape || strArr.peek() != strEnd)) {
      if (strArr.peek() == '\\') {
        escape = true;
      } else {
        escape = false;
      }
      if (strArr.peek() == '\n' && !escape) {
        throw "Unexpected end of line";
      }
      str += strArr.getNext();
    }
    if (!strArr.hasNext || strArr.peek() != strEnd) {
      throw "Unterminated string";
    } else {
      str += strArr.getNext();
    }
    return {
      type: "STRING",
      token: str
    };
  };

  const parseLabel = function (strArr, builder) {
    let label = "";
    while (strArr.hasNext() && /[0-9a-zA-Z_$.]/.test(strArr.peek())) {
      label += strArr.getNext();
    }

    let type = "TOKEN";
    if (strArr.hasNext()) {
      const next = strArr.peek();
      if (!/\s|\n|:|;/.test(next)) {
        throw "Illegal character";
      } else if (next === ':') {
        strArr.getNext();
        type = "LABEL";
      }
    }

    let op = null;
    if (type === "TOKEN") {
      if (label in mnemo) {
        type = "KEYWORD";
        op = mnemo[label];
      } else if (label in builder.macros) {
        type = "MACRO";
      }
    }

    return {
      type: type,
      token: label,
      op: op
    };
  };

  const getTokens = function (strArr, builder) {
    const tokens = [];
    while (strArr.hasNext()) {
      if (parseWhitespace(strArr).token) {
        continue;
      }
      const meta = {
        line: strArr.line,
        col: strArr.col
      };

      const next = strArr.peek();
      let token = null;
      try {
        if (next === ';' || next === '#' || (next === '-' && strArr.peek(1) === '-')) {
          token = parseLineComment(strArr);
        } else if (next === '{' && strArr.peek(1) === '-') {
          token = parseMultiLineComment(strArr);
        } else if (/["']/.test(next)) {
          token = parseString(strArr);
        } else if (/[-+\d]/.test(next)) {
          token = parseNumber(strArr);
        } else {
          token = parseLabel(strArr, builder);
        }
      } catch (err) {
        if (typeof err == "string") {
          throw {
            tokens: tokens,
            meta: meta,
            message: err + " at line " + meta.line,
            line: meta.line
          }
        } else {
          throw err;
        }
      }

      token.meta = meta;

      if (token.type === "STRING") {
        token.data = getStringArray(token.token);
      }
      if (token.type !== "COMMENT") {
        tokens.push(token);
      }
    }
    return tokens;
  };

  const pushInstruction = function (builder, constr, paramNumber) {
    const instruction = new constr();
    if (typeof paramNumber != "undefined" && paramNumber != null) {
      instruction.param = {token: ws_util.getWsSignedNumber(paramNumber), value: paramNumber};
    }
    builder.pushInstruction(instruction);
  };

  const postProcess = function (builder) {
    while (builder.externals.length > 0) {
      const ext = builder.externals.shift();
      for (const inst of ext.programStack) {
        builder.pushInstruction(inst);
      }
    }
    return builder.postProcess();
  };

  const checkMacroParams = function (token, builder) {
    const macro = builder.macros[token];
    if (typeof macro.action == "function") {
      let n = 0;
      for (const paramType of macro.param) {
        const parToken = builder.tokens[n++];
        if (!parToken || parToken.type != paramType) {
          return false;
        }
      }
    }
    return true;
  };

  return {
    compile: function (str, master) {
      const strArr = new ws_util.StrArr(str);
      const builder = ws.programBuilder(str, master);
      let tokenError;
      builder.macros = builder.macros || builtinMacros();
      builder.includes = builder.includes || {};
      builder.externals = builder.externals || [];
      try {
        builder.tokens = getTokens(strArr, builder);
      } catch (err) {
        if (err.tokens) {
          builder.tokens = err.tokens;
          tokenError = err;
        } else {
          throw err;
        }
      }
      builder.asmLabeler = builder.asmLabeler || new ws_util.labelTransformer(function(counter, label) {
        return ws_util.getWsUnsignedNumber(counter);
      });

      const labeler = builder.asmLabeler;

      let parentLabel = "";

      while (builder.tokens.length > 0) {
        const token = builder.tokens.shift();
        const meta = token.meta;
        try {
          if (token.type === "LABEL") {
            let label = token.token;
            if (ws_util.isLocalLabel(label)) {
              label = parentLabel + label;
            } else {
              parentLabel = label;
            }

            if (typeof builder.labels[labeler.getLabel(label)] === "number") {
              throw "Multiple definitions of label " + label;
            }

            builder.labels[labeler.getLabel(label)] = builder.programStack.length;
            builder.asmLabels[labeler.getLabel(label)] = label;
          } else if (token.op && token.op.constr === ws.WsLabel) {
            const param = builder.tokens.shift();
            if (!param) {
              throw "Missing label";
            }
            if (param.type !== "TOKEN") {
              throw "Invalid label";
            }

            const label = param.token;
            if (builder.labels[labeler.getLabel(label)]) {
              throw "Multiple definitions of label " + label;
            }

            builder.labels[labeler.getLabel(label)] = builder.programStack.length;
            builder.asmLabels[labeler.getLabel(label)] = label;
          } else if (token.token in builder.macros && checkMacroParams(token.token, builder)) {
            token.type = "MACRO"; // can be label in some cases
            const macro = builder.macros[token.token];
            if (typeof macro.action == "function") {
              const params = [token];
              for (const paramType of macro.param) {
                const parToken = builder.tokens.shift();
                if (!parToken || parToken.type != paramType) {
                  throw "Expected " + paramType;
                } else {
                  params.push(parToken);
                }
              }
              macro.action(params, builder);
            } else {
              throw "Unimplemented macro type " + typeof macro.action;
            }
          } else if (token.type === "KEYWORD") {
            const op = token.op;
            let instruction = new op.constr();

            if (op.optparam === 'NUMBER' && builder.tokens[0] && builder.tokens[0].type == op.optparam) {
              pushInstruction(builder, ws.WsPush, builder.tokens.shift().data);
            }

            if (op.param) {
              const param = builder.tokens.shift();
              if (!param) {
                throw "Parameter expected";
              }
              if (op.param === "NUMBER") {
                if (param.type === "NUMBER") {
                  pushInstruction(builder, op.constr, param.data);
                } else if (instruction instanceof ws.WsPush && param.type == "STRING") {
                  for (let i = param.data.length - 1; i >= 0; i--) {
                    pushInstruction(builder, op.constr, param.data[i]);
                  }
                } else {
                  throw "Unexpected token " + param.token;
                }
              } else if (op.param === "LABEL") {
                instruction = new op.constr();
                let label = param.token;
                if (ws_util.isLocalLabel(label)) label = parentLabel + label;

                instruction.param = {
                  token: labeler.getLabel(label), value: null, label: label
                };
                builder.pushInstruction(instruction);
              } else {
                throw "Unsupported parameter type " + op.param + " (should never happen)."
              }
            } else {
              pushInstruction(builder, op.constr);
            }
          } else if (token.token in builder.macros) {
          } else {
            throw "Unexpected token " + token.token;
          }
        } catch (err) {
          if (typeof err === "string") {
            throw {
              program: null,
              line: meta.line,
              message: err + " at line " + meta.line + "."
            };
          } else {
            throw err;
          }
        }
      }

      if (tokenError) {
        throw {
          program: null,
          line: tokenError.meta.line,
          message: tokenError.message
        }
      }

      try {
        return postProcess(builder);
      } catch (err) {
        if (typeof err === "string") {
          throw {
            message: err
          }
        } else {
          throw err;
        }
      }
    },
  };
})();
