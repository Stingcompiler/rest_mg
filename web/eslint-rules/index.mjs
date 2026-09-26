/**
 * Project guardrails.
 *
 * Five rules that exist because each one, broken quietly, costs a rewrite:
 * a physical margin that survives into Arabic, a hex code that ignores the
 * theme, a string that cannot be translated, a fetch on the cashier's critical
 * path, and a domain entity that learns about the database.
 *
 * They are lint rules rather than review notes so they fail in the editor and
 * in CI, on the first commit, not on the fiftieth.
 */

const PHYSICAL_CLASS = /(^|[\s:'"`])(-?(ml|mr|pl|pr)-|text-(left|right)\b|(left|right)-(0|px|\d|\[))/;
const HEX_COLOUR = /#[0-9a-fA-F]{3,8}\b/;
const CSS_FUNCTION_COLOUR = /\b(rgba?|hsla?)\s*\(/;
const ARBITRARY_PX = /\[\d+(\.\d+)?px\]/;
const HAS_LETTERS = /\p{L}{2,}/u;

const posPath = /[\\/]app[\\/]\(pos\)[\\/]|[\\/]features[\\/]pos[\\/]/;
const domainPath = /[\\/]src[\\/]domain[\\/]/;
const uiPath = /[\\/]src[\\/](app|components|features)[\\/]/;

function stringValuesOf(node) {
  if (!node) return [];
  if (node.type === 'Literal' && typeof node.value === 'string') return [[node, node.value]];
  if (node.type === 'TemplateLiteral') {
    return node.quasis.map((quasi) => [quasi, quasi.value.raw]);
  }
  if (node.type === 'JSXExpressionContainer') return stringValuesOf(node.expression);
  if (node.type === 'ConditionalExpression') {
    return [...stringValuesOf(node.consequent), ...stringValuesOf(node.alternate)];
  }
  if (node.type === 'LogicalExpression') {
    return [...stringValuesOf(node.left), ...stringValuesOf(node.right)];
  }
  if (node.type === 'ArrayExpression') return node.elements.flatMap(stringValuesOf);
  if (node.type === 'CallExpression') return node.arguments.flatMap(stringValuesOf);
  return [];
}

const noPhysicalDirection = {
  meta: {
    type: 'problem',
    docs: { description: 'Use logical direction utilities so Arabic and English mirror correctly.' },
    schema: [],
    messages: {
      physical: "'{{ text }}' is physical. Use the logical form (ms-/me-/ps-/pe-/start-/end-/text-start/text-end) — Arabic is the default locale and RTL must mirror.",
    },
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (!node.name || node.name.name !== 'className') return;
        for (const [target, value] of stringValuesOf(node.value)) {
          const match = PHYSICAL_CLASS.exec(value);
          if (match) {
            context.report({ node: target, messageId: 'physical', data: { text: match[0].trim() } });
          }
        }
      },
    };
  },
};

const noLiteralDesignValues = {
  meta: {
    type: 'problem',
    docs: { description: 'Colours and sizes come from design tokens, never from literals.' },
    schema: [],
    messages: {
      colour: "'{{ text }}' is a literal colour in a {{ where }}. Use a token class (bg-surface, text-muted, border-line) — literals do not follow the theme.",
      size: "'{{ text }}' is a literal size in a {{ where }}. Use the spacing/radius/control scale from tailwind.config.ts.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!uiPath.test(filename)) return {};

    // Only className and inline style carry design values into a component. A
    // hex in browser-chrome metadata (themeColor) or a data URI is not a style.
    function check(node, value, where) {
      if (HEX_COLOUR.test(value) || CSS_FUNCTION_COLOUR.test(value)) {
        context.report({ node, messageId: 'colour', data: { text: value.slice(0, 40), where } });
        return;
      }
      if (ARBITRARY_PX.test(value)) {
        context.report({ node, messageId: 'size', data: { text: value.slice(0, 40), where } });
      }
    }

    return {
      JSXAttribute(node) {
        const name = node.name && node.name.name;
        if (name !== 'className' && name !== 'style') return;
        const where = name;
        for (const [target, value] of stringValuesOf(node.value)) {
          check(target, value, where);
        }
        // Inline style objects: style={{ color: '#fff' }}
        if (
          name === 'style' &&
          node.value &&
          node.value.type === 'JSXExpressionContainer' &&
          node.value.expression.type === 'ObjectExpression'
        ) {
          for (const property of node.value.expression.properties) {
            if (property.type !== 'Property') continue;
            for (const [target, value] of stringValuesOf(property.value)) {
              check(target, value, 'style');
            }
          }
        }
      },
    };
  },
};

const noRawStrings = {
  meta: {
    type: 'problem',
    docs: { description: 'User-facing text goes through i18n.' },
    schema: [],
    messages: {
      raw: "'{{ text }}' is a hardcoded string. Route it through the message catalogue — the app ships Arabic and English from commit one.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!uiPath.test(filename)) return {};

    return {
      JSXText(node) {
        const text = node.value.trim();
        if (text && HAS_LETTERS.test(text)) {
          context.report({ node, messageId: 'raw', data: { text: text.slice(0, 40) } });
        }
      },
    };
  },
};

const noNetworkInPos = {
  meta: {
    type: 'problem',
    docs: { description: 'The cashier reads and writes IndexedDB. Never the network.' },
    schema: [],
    messages: {
      call: "'{{ name }}' is a network call on a cashier path. /pos reads and writes IndexedDB only; syncing is background work in src/sync.",
      import: "'{{ source }}' is a network client. /pos may not import one — the UI never awaits a request before painting.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!posPath.test(filename)) return {};

    const bannedCalls = new Set(['fetch', 'useQuery', 'useMutation', 'useSuspenseQuery']);
    const bannedImports = [/^axios$/, /^@tanstack\/react-query$/, /^swr$/];

    return {
      CallExpression(node) {
        const callee = node.callee;
        const name =
          callee.type === 'Identifier'
            ? callee.name
            : callee.type === 'MemberExpression' && callee.property.type === 'Identifier'
              ? callee.property.name
              : null;
        if (name && bannedCalls.has(name)) {
          context.report({ node, messageId: 'call', data: { name } });
        }
      },
      ImportDeclaration(node) {
        const source = node.source.value;
        if (typeof source === 'string' && bannedImports.some((pattern) => pattern.test(source))) {
          context.report({ node, messageId: 'import', data: { source } });
        }
      },
    };
  },
};

const domainPurity = {
  meta: {
    type: 'problem',
    docs: { description: 'Entities know nothing about persistence, rendering or the network.' },
    schema: [],
    messages: {
      impure: "src/domain may not import '{{ source }}'. Entities guard business rules and know nothing about persistence, printing, React or the network.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!domainPath.test(filename)) return {};

    const banned = [
      /^react/, /^next/, /^@\/db/, /^@\/sync/, /^@\/app/, /^@\/components/,
      /^\.\.?\/.*\b(db|sync|repositories|components)\b/, /^idb/, /^axios$/,
    ];

    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (typeof source === 'string' && banned.some((pattern) => pattern.test(source))) {
          context.report({ node, messageId: 'impure', data: { source } });
        }
      },
    };
  },
};

export default {
  rules: {
    'no-physical-direction': noPhysicalDirection,
    'no-literal-design-values': noLiteralDesignValues,
    'no-raw-strings': noRawStrings,
    'no-network-in-pos': noNetworkInPos,
    'domain-purity': domainPurity,
  },
};
