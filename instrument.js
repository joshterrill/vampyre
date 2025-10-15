const fs = require('fs');
const vm = require('vm');
const path = require('path');

const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');

function codeFor(node) {
  return generate(node).code;
}

// await-safe reporter wrapper: returns an AST node that reports nameStr and preserves await semantics.
function makeReporterCall(nameStr, valueNode) {
  // if valueNode is an AwaitExpression, we cannot place it directly inside an argument list in many contexts
  // wrap it into an async IIFE and await that IIFE's result
  if (t.isAwaitExpression(valueNode)) {
    // create: await (async () => __report("name", await <expr>))()
    const innerAwait = valueNode; // the AwaitExpression
    const callExpr = t.callExpression(
      t.arrowFunctionExpression(
        [], // no params
        t.blockStatement([
          t.returnStatement(t.callExpression(t.identifier('__report'), [t.stringLiteral(nameStr), innerAwait]))
        ]),
        true // async
      ),
      []
    );
    return t.awaitExpression(callExpr);
  }

  // Normal case
  return t.callExpression(t.identifier('__report'), [t.stringLiteral(nameStr), valueNode]);
}

function safeReportWrap(nameStr, valueNode) {
  return makeReporterCall(nameStr, valueNode);
}

function transformUpdateExpression(path) {
  const node = path.node;
  const arg = node.argument;
  const operator = node.operator; // '++' or '--'
  const isPrefix = node.prefix;
  const scope = path.scope;

  function makeDeltaExpression(expr) {
    return operator === '++' ? t.binaryExpression('+', expr, t.numericLiteral(1)) : t.binaryExpression('-', expr, t.numericLiteral(1));
  }

  if (t.isIdentifier(arg)) {
    const name = arg.name;
    if (isPrefix) {
      // (function(){ name = __report("name", name + 1); return name; })()
      const assign = t.assignmentExpression('=', t.identifier(name), safeReportWrap(name, makeDeltaExpression(t.identifier(name))));
      const body = t.blockStatement([t.expressionStatement(assign), t.returnStatement(t.identifier(name))]);
      path.replaceWith(t.callExpression(t.arrowFunctionExpression([], body), []));
    } else {
      // postfix: (function(){ const old = name; name = __report("name", old + 1); return old; })()
      const oldId = scope.generateUidIdentifier('old');
      const oldDecl = t.variableDeclaration('const', [t.variableDeclarator(oldId, t.identifier(name))]);
      const assign = t.assignmentExpression('=', t.identifier(name), safeReportWrap(name, makeDeltaExpression(oldId)));
      const body = t.blockStatement([oldDecl, t.expressionStatement(assign), t.returnStatement(oldId)]);
      path.replaceWith(t.callExpression(t.arrowFunctionExpression([], body), []));
    }
    return;
  }

  if (t.isMemberExpression(arg)) {
    const obj = arg.object;
    const prop = arg.property;
    const isComputed = arg.computed;
    const objTemp = scope.generateUidIdentifier('obj');
    const objDecl = t.variableDeclaration('const', [t.variableDeclarator(objTemp, obj)]);
    if (isComputed) {
      const propTemp = scope.generateUidIdentifier('prop');
      const propDecl = t.variableDeclaration('const', [t.variableDeclarator(propTemp, prop)]);
      const access = t.memberExpression(objTemp, propTemp, true);
      if (isPrefix) {
        const assign = t.assignmentExpression('=', access, safeReportWrap(codeFor(arg), makeDeltaExpression(access)));
        const body = t.blockStatement([objDecl, propDecl, t.expressionStatement(assign), t.returnStatement(access)]);
        path.replaceWith(t.callExpression(t.arrowFunctionExpression([], body), []));
      } else {
        const oldId = scope.generateUidIdentifier('old');
        const oldDecl = t.variableDeclaration('const', [t.variableDeclarator(oldId, access)]);
        const assign = t.assignmentExpression('=', access, safeReportWrap(codeFor(arg), makeDeltaExpression(oldId)));
        const body = t.blockStatement([objDecl, propDecl, oldDecl, t.expressionStatement(assign), t.returnStatement(oldId)]);
        path.replaceWith(t.callExpression(t.arrowFunctionExpression([], body), []));
      }
    } else {
      const access = t.memberExpression(objTemp, t.identifier(prop.name), false);
      if (isPrefix) {
        const assign = t.assignmentExpression('=', access, safeReportWrap(codeFor(arg), makeDeltaExpression(access)));
        const body = t.blockStatement([objDecl, t.expressionStatement(assign), t.returnStatement(access)]);
        path.replaceWith(t.callExpression(t.arrowFunctionExpression([], body), []));
      } else {
        const oldId = scope.generateUidIdentifier('old');
        const oldDecl = t.variableDeclaration('const', [t.variableDeclarator(oldId, access)]);
        const assign = t.assignmentExpression('=', access, safeReportWrap(codeFor(arg), makeDeltaExpression(oldId)));
        const body = t.blockStatement([objDecl, oldDecl, t.expressionStatement(assign), t.returnStatement(oldId)]);
        path.replaceWith(t.callExpression(t.arrowFunctionExpression([], body), []));
      }
    }
    return;
  }

  // fallback: wrap whole node
  path.replaceWith(safeReportWrap(codeFor(arg), node));
}

function expandDeclaratorDestructuring(declPath, declarator) {
  const id = declarator.id;
  const init = declarator.init || t.identifier('undefined');
  const tempId = declPath.scope.generateUidIdentifierBasedOnNode(t.identifier('tmp_destruct'));
  const patternCode = codeFor(id);
  const tempInit = safeReportWrap(patternCode, init);
  const tempDeclarator = t.variableDeclarator(tempId, tempInit);

  const bindingDeclarators = [];

  function walkPattern(node, baseAccessor) {
    if (t.isIdentifier(node)) {
      const name = node.name;
      bindingDeclarators.push(t.variableDeclarator(t.identifier(name), safeReportWrap(name, baseAccessor)));
      return;
    }
    if (t.isArrayPattern(node)) {
      node.elements.forEach((elem, idx) => {
        if (elem === null) return;
        const accessor = t.memberExpression(baseAccessor, t.numericLiteral(idx), true);
        if (t.isIdentifier(elem)) {
          bindingDeclarators.push(t.variableDeclarator(t.identifier(elem.name), safeReportWrap(elem.name, accessor)));
        } else if (t.isRestElement(elem)) {
          const arg = elem.argument;
          const sliceCall = t.callExpression(t.memberExpression(baseAccessor, t.identifier('slice')), [t.numericLiteral(idx)]);
          bindingDeclarators.push(t.variableDeclarator(t.identifier(arg.name), safeReportWrap(arg.name, sliceCall)));
        } else {
          walkPattern(elem, accessor);
        }
      });
      return;
    }
    if (t.isObjectPattern(node)) {
      node.properties.forEach((prop) => {
        if (t.isRestElement(prop)) {
          const arg = prop.argument;
          bindingDeclarators.push(t.variableDeclarator(t.identifier(arg.name), safeReportWrap(arg.name, baseAccessor)));
          return;
        }
        if (t.isObjectProperty(prop)) {
          const key = prop.key;
          let accessor;
          if (prop.computed) {
            accessor = t.memberExpression(baseAccessor, key, true);
          } else if (t.isIdentifier(key)) {
            accessor = t.memberExpression(baseAccessor, t.identifier(key.name), false);
          } else {
            accessor = t.memberExpression(baseAccessor, key, true);
          }
          if (t.isIdentifier(prop.value)) {
            bindingDeclarators.push(t.variableDeclarator(t.identifier(prop.value.name), safeReportWrap(prop.value.name, accessor)));
          } else {
            walkPattern(prop.value, accessor);
          }
        } else {
          bindingDeclarators.push(t.variableDeclarator(t.identifier(codeFor(prop)), safeReportWrap(codeFor(prop), baseAccessor)));
        }
      });
      return;
    }
    if (t.isAssignmentPattern(node)) {
      if (t.isIdentifier(node.left)) {
        const name = node.left.name;
        const coalesce = t.logicalExpression('??', baseAccessor, node.right);
        bindingDeclarators.push(t.variableDeclarator(t.identifier(name), safeReportWrap(name, coalesce)));
      } else {
        walkPattern(node.left, baseAccessor);
      }
      return;
    }
    // fallback
    bindingDeclarators.push(t.variableDeclarator(t.identifier(codeFor(node)), safeReportWrap(codeFor(node), baseAccessor)));
  }

  walkPattern(id, tempId);
  return { tempDeclarator, bindingDeclarators };
}

function expandAssignmentDestructuring(path) {
  const node = path.node;
  const left = node.left;
  const right = node.right;
  const scope = path.scope;
  const tmp = scope.generateUidIdentifier('tmp_assign');
  const patternCode = codeFor(left);
  const tmpDecl = t.variableDeclaration('const', [t.variableDeclarator(tmp, safeReportWrap(patternCode, right))]);
  const stmts = [tmpDecl];

  function walkPatternAssign(pat, baseExpr) {
    if (t.isIdentifier(pat)) {
      stmts.push(t.expressionStatement(t.assignmentExpression('=', t.identifier(pat.name), safeReportWrap(pat.name, baseExpr))));
      return;
    }
    if (t.isArrayPattern(pat)) {
      pat.elements.forEach((el, idx) => {
        if (el === null) return;
        const accessor = t.memberExpression(baseExpr, t.numericLiteral(idx), true);
        if (t.isIdentifier(el)) {
          stmts.push(t.expressionStatement(t.assignmentExpression('=', t.identifier(el.name), safeReportWrap(el.name, accessor))));
        } else if (t.isRestElement(el)) {
          const arg = el.argument;
          const sliceCall = t.callExpression(t.memberExpression(baseExpr, t.identifier('slice')), [t.numericLiteral(idx)]);
          stmts.push(t.expressionStatement(t.assignmentExpression('=', t.identifier(arg.name), safeReportWrap(arg.name, sliceCall))));
        } else {
          walkPatternAssign(el, accessor);
        }
      });
      return;
    }
    if (t.isObjectPattern(pat)) {
      pat.properties.forEach((prop) => {
        if (t.isRestElement(prop)) {
          const arg = prop.argument;
          stmts.push(t.expressionStatement(t.assignmentExpression('=', t.identifier(arg.name), safeReportWrap(arg.name, baseExpr))));
          return;
        }
        if (t.isObjectProperty(prop)) {
          let accessor;
          if (prop.computed) accessor = t.memberExpression(baseExpr, prop.key, true);
          else accessor = t.memberExpression(baseExpr, t.identifier(prop.key.name), false);
          if (t.isIdentifier(prop.value)) {
            stmts.push(t.expressionStatement(t.assignmentExpression('=', t.identifier(prop.value.name), safeReportWrap(prop.value.name, accessor))));
          } else {
            walkPatternAssign(prop.value, accessor);
          }
        }
      });
      return;
    }
    if (t.isAssignmentPattern(pat)) {
      if (t.isIdentifier(pat.left)) {
        const name = pat.left.name;
        const coalesce = t.logicalExpression('??', baseExpr, pat.right);
        stmts.push(t.expressionStatement(t.assignmentExpression('=', t.identifier(name), safeReportWrap(name, coalesce))));
      } else {
        walkPatternAssign(pat.left, baseExpr);
      }
      return;
    }
    stmts.push(t.expressionStatement(t.assignmentExpression('=', pat, safeReportWrap(codeFor(pat), baseExpr))));
  }

  walkPatternAssign(left, tmp);
  const body = t.blockStatement([...stmts, t.returnStatement(tmp)]);
  const iife = t.callExpression(t.arrowFunctionExpression([], body), []);
  path.replaceWith(iife);
}

// main instrumentation function
function instrumentCode(sourceCode) {
  const ast = parser.parse(sourceCode, {
    sourceType: 'unambiguous',
    plugins: [
      'jsx', 'classProperties', 'optionalChaining', 'dynamicImport', 'objectRestSpread',
      'numericSeparator', 'topLevelAwait', 'bigInt', 'optionalCatchBinding', 'nullishCoalescingOperator'
    ]
  });

  traverse(ast, {
    VariableDeclaration(path) {
      const decls = path.node.declarations;
      const newDecls = [];
      const inserts = [];

      decls.forEach((decl) => {
        if (!decl.init) {
          newDecls.push(decl);
          return;
        }
        if (t.isIdentifier(decl.id)) {
          decl.init = safeReportWrap(decl.id.name, decl.init);
          newDecls.push(decl);
          return;
        }
        if (t.isPattern(decl.id)) {
          const { tempDeclarator, bindingDeclarators } = expandDeclaratorDestructuring(path, decl);
          newDecls.push(tempDeclarator);
          if (bindingDeclarators.length > 0) {
            const bindingDecl = t.variableDeclaration(path.node.kind, bindingDeclarators);
            inserts.push(bindingDecl);
          }
          return;
        }
        // fallback
        decl.init = safeReportWrap(codeFor(decl.id), decl.init);
        newDecls.push(decl);
      });

      path.node.declarations = newDecls;
      if (inserts.length > 0) {
        for (let i = inserts.length - 1; i >= 0; i--) path.insertAfter(inserts[i]);
      }
    },

    AssignmentExpression(path) {
      if (t.isArrayPattern(path.node.left) || t.isObjectPattern(path.node.left)) {
        expandAssignmentDestructuring(path);
        return;
      }
      const left = path.node.left;
      const leftName = t.isIdentifier(left) ? left.name : codeFor(left);
      path.node.right = safeReportWrap(leftName, path.node.right);
    },

    UpdateExpression(path) {
      transformUpdateExpression(path);
      path.skip();
    },

    // no need to touch MemberExpression, CallExpression, etc.
  });

  const { code } = generate(ast, {
    compact: true,
    comments: false,
    sourceMaps: false,
    minified: true,
    jsescOption: { minimal: true }
  });

  return code;
}

function wrapEvalAndFunctionInContext(context, instrumentFunc) {
  context.eval = function (code) {
    try {
      if (typeof code === 'string') {
        const instrumented = instrumentFunc(code);
        return vm.runInContext(new vm.Script(instrumented), context);
      } else {
        return global.eval(code);
      }
    } catch (err) {
      return global.eval(code);
    }
  };

  const OriginalFunction = Function;
  context.Function = function (...args) {
    const body = args.length ? args[args.length - 1] : '';
    const params = args.length ? args.slice(0, args.length - 1) : [];
    let instrumentedBody = body;
    try {
      if (typeof body === 'string') instrumentedBody = instrumentFunc(body);
    } catch (e) {
      instrumentedBody = body;
    }
    return OriginalFunction.apply(null, [...params, instrumentedBody]);
  };
  context.Function.prototype = OriginalFunction.prototype;
}


function runInstrumentedFile(inputPath) {
  const src = fs.readFileSync(inputPath, 'utf8');
  const instrumented = instrumentCode(src);

  fs.writeFileSync('instrumented.js', instrumented, 'utf8');
  console.log('Wrote instrumented.js');

  const logStream = fs.createWriteStream('observations.jsonl', { flags: 'a' });

  // prepare runtime context
  const context = {
    console,
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
    globalThis: {},
    // will add __report below
  };

  // create a basic DOM-like environment for code that references window/document
  context.window = context;
  context.document = {
    createElement: (tag) => ({ tagName: tag, setAttribute() {}, appendChild() {}, innerHTML: '', src: '', href: '' }),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    body: { appendChild() {}, removeChild() {} },
    head: { appendChild() {}, removeChild() {} },
    addEventListener() {},
    removeEventListener() {},
    location: { href: 'http://localhost/' },
  };
  context.navigator = { userAgent: 'NodeFake' };
  context.location = { href: 'http://localhost/', assign() {}, replace() {}, reload() {} };
  context.window.document = context.document;

  context.__report = function (name, value) {
    try {
      let snapshot;
      if (value === undefined) snapshot = undefined;
      else if (typeof value === 'function') snapshot = `[Function: ${value.name || 'anonymous'}]`;
      else if (typeof value === 'object' && value !== null) {
        try {
          snapshot = JSON.parse(JSON.stringify(value));
        } catch (err) {
          try {
            snapshot = String(value);
          } catch (e) {
            snapshot = Object.prototype.toString.call(value);
          }
        }
      } else {
        snapshot = value;
      }
      const rec = { ts: Date.now(), name, value: snapshot };
      logStream.write(JSON.stringify(rec) + '\n');
      if (process.env.REPORT_CONSOLE === '1') console.log('[__report]', rec);
    } catch (err) {
      // do nothing to avoid crashing the instrumented code
    }
    return value;
  };

  // attach some additional globals into the VM context
  const ctx = vm.createContext(context);
  ctx.global = ctx;
  ctx.window = ctx;
  ctx.navigator = context.navigator;
  ctx.document = context.document;

  // instrument eval/Function inside this context
  wrapEvalAndFunctionInContext(ctx, (codeStr) => {
    try {
      return instrumentCode(codeStr);
    } catch (e) {
      return codeStr;
    }
  });

  try {
    const script = new vm.Script(instrumented, { filename: path.basename(inputPath) });
    script.runInContext(ctx, { timeout: 60000 });
  } catch (err) {
    console.error('Execution error:', err && err.stack ? err.stack : err);
  } finally {
    // close log stream
    logStream.end(() => {
      console.log('Observations appended to observations.jsonl');
    });
  }
}

if (require.main === module) {
  const inputPath = process.argv[2] || 'input.js';
  if (!fs.existsSync(inputPath)) {
    console.error('Error: input file not found:', inputPath);
    process.exit(2);
  }
  runInstrumentedFile(inputPath);
}

module.exports = { instrumentCode };
