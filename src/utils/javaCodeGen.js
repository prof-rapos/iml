import { getAllAttributes } from './modelHelpers.js';

// ── String / naming helpers ───────────────────────────────────────────────────

function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function safeId(name) {
  const sanitized = (name || 'field')
    .replace(/[^a-zA-Z0-9_$\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => i === 0
      ? w.charAt(0).toLowerCase() + w.slice(1)
      : capitalize(w))
    .join('');
  return sanitized || '_field';
}

function toClassName(name) {
  const sanitized = (name || 'Class')
    .replace(/[^a-zA-Z0-9_$\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(capitalize)
    .join('');
  return sanitized || 'GeneratedClass';
}

function toPackageName(name) {
  return (name || 'model')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/^_+|_+$/g, '') || 'model';
}

// ── Type helpers ──────────────────────────────────────────────────────────────

function javaType(type) {
  switch (type) {
    case 'INT':     return 'int';
    case 'DOUBLE':  return 'double';
    case 'BOOLEAN': return 'boolean';
    default:        return 'String';
  }
}

function boxedType(type) {
  switch (type) {
    case 'INT':     return 'Integer';
    case 'DOUBLE':  return 'Double';
    case 'BOOLEAN': return 'Boolean';
    default:        return 'String';
  }
}

function defaultValue(type) {
  switch (type) {
    case 'INT':     return '0';
    case 'DOUBLE':  return '0.0';
    case 'BOOLEAN': return 'false';
    default:        return '""';
  }
}

function javaLiteral(value, type) {
  switch (type) {
    case 'INT':     return String(parseInt(value, 10)  || 0);
    case 'DOUBLE':  return String(parseFloat(value)    || 0.0);
    case 'BOOLEAN': return value === 'true' ? 'true' : 'false';
    default:        return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
}

// ── Inheritance helpers ───────────────────────────────────────────────────────

function getParentClass(classId, metaModel) {
  const rel = metaModel.relations.find(r => r.kind === 'INHERITANCE' && r.source === classId);
  return rel ? (metaModel.classes.find(c => c.id === rel.target) ?? null) : null;
}

// ── Relation helpers ──────────────────────────────────────────────────────────

function isMultiRelation(rel) {
  const mult = (rel.targetMultiplicity || '').trim();
  if (!mult) return false;
  if (mult === '*') return true;
  if (mult.includes('..')) {
    const upper = mult.split('..')[1].trim();
    return upper === '*' || parseInt(upper, 10) > 1;
  }
  return false;
}

function getRelationFieldName(rel, targetCls) {
  if (rel.name && rel.name.trim()) return safeId(rel.name);
  const base = safeId(targetCls.name);
  return isMultiRelation(rel) ? base + 'List' : base;
}

// ── ASCII art class header ────────────────────────────────────────────────────
// Each line (incl. " * " prefix) has length: BOX_INNER + 7
// Separator : " * " + "=" * (BOX_INNER + 4)
// Box line  : " * ||" + BOX_INNER chars + "||"

function generateAsciiComment(cls, metaModel) {
  const VISIBILITY = { PUBLIC: '+', PRIVATE: '-', PROTECTED: '#' };

  const parent    = getParentClass(cls.id, metaModel);
  const relations = metaModel.relations.filter(
    r => r.source === cls.id && r.kind !== 'INHERITANCE'
  );

  // ── Collect content strings to compute required width ──────────────
  const headerName    = cls.isAbstract ? `«${cls.name}»` : cls.name;
  const headerExtends = parent ? `extends ${parent.name}` : null;

  const attrStrings = cls.attributes.map(a => {
    const vis   = VISIBILITY[a.visibility] || '+';
    const upper = a.upperBound === -1 ? '*' : a.upperBound;
    return `[${a.lowerBound}..${upper}]  ${vis}  ${a.name} : ${a.type}`;
  });

  const relStrings = relations.map(rel => {
    const targetCls = metaModel.classes.find(c => c.id === rel.target);
    if (!targetCls) return null;
    const label   = rel.name && rel.name.trim() ? rel.name : rel.kind.toLowerCase();
    const srcMult = rel.sourceMultiplicity ? `[${rel.sourceMultiplicity}] ` : '';
    const tgtMult = rel.targetMultiplicity ? ` [${rel.targetMultiplicity}]` : '';
    return `${srcMult}${label} --> ${targetCls.name}${tgtMult}`;
  }).filter(Boolean);

  // BOX_INNER = chars between the || delimiters (includes padding)
  const candidates = [
    headerName,
    headerExtends,
    'Attributes',
    ...attrStrings,
    relStrings.length > 0 ? 'Relations' : null,
    ...relStrings,
  ].filter(Boolean);

  const MIN_INNER = 44;
  // data lines use "  text  " so need text.length + 2 minimum inner width
  const BOX_INNER = Math.max(MIN_INNER, ...candidates.map(s => s.length + 4));

  // ── Box-drawing helpers ────────────────────────────────────────────
  const sep = ` * ${'='.repeat(BOX_INNER + 4)}`;

  const center = (s) => {
    const pad   = BOX_INNER - s.length;
    const left  = Math.floor(pad / 2);
    const right = pad - left;
    return ` * ||${' '.repeat(left)}${s}${' '.repeat(right)}||`;
  };

  const data = (s) => {
    const pad = BOX_INNER - 2 - s.length; // 1 space each side inside ||
    return ` * || ${s}${' '.repeat(Math.max(0, pad))} ||`;
  };

  // ── Build comment ──────────────────────────────────────────────────
  const lines = ['/*', sep];

  lines.push(center(headerName));
  if (headerExtends) lines.push(center(headerExtends));
  lines.push(sep);

  lines.push(center('Attributes'));
  lines.push(sep);
  if (attrStrings.length === 0) {
    lines.push(data('(none)'));
  } else {
    attrStrings.forEach(s => lines.push(data(s)));
  }

  if (relStrings.length > 0) {
    lines.push(sep);
    lines.push(center('Relations'));
    lines.push(sep);
    relStrings.forEach(s => lines.push(data(s)));
  }

  lines.push(sep);
  lines.push(' */');

  return lines.join('\n');
}

// ── Class file generator ──────────────────────────────────────────────────────

function boundsComment(attr) {
  const upper = attr.upperBound === -1 ? '*' : attr.upperBound;
  return `// [${attr.lowerBound}..${upper}] ${attr.type}`;
}

function hasMetaDefault(attr) {
  return attr.defaultValue !== undefined && String(attr.defaultValue).trim() !== '';
}

function generateClassFile(cls, metaModel, pkg) {
  const parent      = getParentClass(cls.id, metaModel);
  const ownAttrs    = cls.attributes;
  const parentAttrs = parent ? getAllAttributes(parent.id, metaModel) : [];
  const allAttrs    = getAllAttributes(cls.id, metaModel);
  const relations   = metaModel.relations.filter(
    r => r.source === cls.id && r.kind !== 'INHERITANCE'
  );

  const needsArrayList =
    ownAttrs.some(a => a.upperBound !== 1) ||
    relations.some(r => isMultiRelation(r));

  const lines = [];

  lines.push(generateAsciiComment(cls, metaModel));
  lines.push(`package ${pkg};`);
  lines.push('');
  if (needsArrayList) {
    lines.push('import java.util.ArrayList;');
    lines.push('');
  }

  const modifier   = cls.isAbstract ? 'public abstract class' : 'public class';
  const extendsStr = parent ? ` extends ${parent.name}` : '';
  lines.push(`${modifier} ${cls.name}${extendsStr} {`);
  lines.push('');

  // ── Own attribute fields ──────────────────────────────────────────
  if (ownAttrs.length > 0) {
    lines.push('    // Attributes');
    for (const attr of ownAttrs) {
      const field = safeId(attr.name);
      lines.push(`    ${boundsComment(attr)}`);
      if (attr.upperBound !== 1) {
        lines.push(`    private ArrayList<${boxedType(attr.type)}> ${field} = new ArrayList<>();`);
      } else if (hasMetaDefault(attr)) {
        lines.push(`    private ${javaType(attr.type)} ${field} = ${javaLiteral(attr.defaultValue, attr.type)};`);
      } else if (attr.lowerBound > 0) {
        lines.push(`    private ${javaType(attr.type)} ${field} = ${defaultValue(attr.type)};`);
      } else {
        lines.push(`    private ${javaType(attr.type)} ${field};`);
      }
    }
    lines.push('');
  }

  // ── Relation fields ───────────────────────────────────────────────
  if (relations.length > 0) {
    lines.push('    // Relations');
    for (const rel of relations) {
      const targetCls = metaModel.classes.find(c => c.id === rel.target);
      if (!targetCls) continue;
      const field = getRelationFieldName(rel, targetCls);
      if (isMultiRelation(rel)) {
        lines.push(`    private ArrayList<${targetCls.name}> ${field} = new ArrayList<>();`);
      } else {
        lines.push(`    private ${targetCls.name} ${field} = null;`);
      }
    }
    lines.push('');
  }

  // ── Default constructor ───────────────────────────────────────────
  lines.push('    // Default constructor');
  lines.push(`    public ${cls.name}() {`);
  if (parent) lines.push('        super();');
  lines.push('    }');
  lines.push('');

  // ── Parameterized constructor ─────────────────────────────────────
  if (allAttrs.length > 0) {
    lines.push('    // Parameterized constructor');
    const params = allAttrs.map(a => {
      if (a.upperBound !== 1) return `ArrayList<${boxedType(a.type)}> ${safeId(a.name)}`;
      return `${javaType(a.type)} ${safeId(a.name)}`;
    }).join(', ');
    lines.push(`    public ${cls.name}(${params}) {`);
    if (parent && parentAttrs.length > 0) {
      lines.push(`        super(${parentAttrs.map(a => safeId(a.name)).join(', ')});`);
    } else if (parent) {
      lines.push('        super();');
    }
    for (const attr of ownAttrs) {
      lines.push(`        this.${safeId(attr.name)} = ${safeId(attr.name)};`);
    }
    lines.push('    }');
    lines.push('');
  }

  // ── Getters and setters for own attributes ────────────────────────
  if (ownAttrs.length > 0) {
    lines.push('    // Getters and setters');
    for (const attr of ownAttrs) {
      const field = safeId(attr.name);
      const cap   = capitalize(field);
      if (attr.upperBound !== 1) {
        const bType = boxedType(attr.type);
        lines.push(`    /** Returns the ${field} list. */`);
        lines.push(`    public ArrayList<${bType}> get${cap}() { return ${field}; }`);
        lines.push(`    /** Sets the ${field} list. */`);
        lines.push(`    public void set${cap}(ArrayList<${bType}> ${field}) { this.${field} = ${field}; }`);
        lines.push(`    /** Adds a value to the ${field} list. */`);
        lines.push(`    public void add${cap}(${bType} value) { this.${field}.add(value); }`);
      } else {
        const jType = javaType(attr.type);
        lines.push(`    /** Returns the value of ${field}. */`);
        lines.push(`    public ${jType} get${cap}() { return ${field}; }`);
        lines.push(`    /** Sets the value of ${field}. */`);
        lines.push(`    public void set${cap}(${jType} ${field}) { this.${field} = ${field}; }`);
      }
    }
    lines.push('');
  }

  // ── Relation accessors ────────────────────────────────────────────
  if (relations.length > 0) {
    lines.push('    // Relation accessors');
    for (const rel of relations) {
      const targetCls = metaModel.classes.find(c => c.id === rel.target);
      if (!targetCls) continue;
      const field = getRelationFieldName(rel, targetCls);
      const cap   = capitalize(field);
      if (isMultiRelation(rel)) {
        lines.push(`    /** Returns the ${field} relation list. */`);
        lines.push(`    public ArrayList<${targetCls.name}> get${cap}() { return ${field}; }`);
        lines.push(`    /** Adds an item to the ${field} relation. */`);
        lines.push(`    public void add${cap}(${targetCls.name} item) { this.${field}.add(item); }`);
        lines.push(`    /** Sets the ${field} relation list. */`);
        lines.push(`    public void set${cap}(ArrayList<${targetCls.name}> ${field}) { this.${field} = ${field}; }`);
      } else {
        lines.push(`    /** Returns the ${field} relation. */`);
        lines.push(`    public ${targetCls.name} get${cap}() { return ${field}; }`);
        lines.push(`    /** Sets the ${field} relation. */`);
        lines.push(`    public void set${cap}(${targetCls.name} ${field}) { this.${field} = ${field}; }`);
      }
    }
    lines.push('');
  }

  // ── toString ──────────────────────────────────────────────────────
  lines.push('    @Override');
  lines.push('    public String toString() {');

  const ownParts = ownAttrs.map(a => {
    const field = safeId(a.name);
    if (a.upperBound !== 1) return `"${field}=" + ${field}`;
    if (a.type === 'STRING')  return `"${field}='" + ${field} + "'"`;
    return `"${field}=" + ${field}`;
  });

  if (parent) {
    const own = ownParts.length > 0 ? ` + ", " + ${ownParts.join(' + ", " + ')}` : '';
    lines.push(`        return "${cls.name}{" + super.toString()${own} + "}";`);
  } else if (cls.isAbstract) {
    lines.push(ownParts.length > 0
      ? `        return ${ownParts.join(' + ", " + ')};`
      : `        return "";`);
  } else {
    lines.push(ownParts.length > 0
      ? `        return "${cls.name}{" + ${ownParts.join(' + ", " + ')} + "}";`
      : `        return "${cls.name}{}";`);
  }

  lines.push('    }');
  lines.push('');

  // ── prettyPrint ───────────────────────────────────────────────────
  lines.push('    public String prettyPrint(int indent) {');
  lines.push('        String pad = "  ".repeat(indent);');
  lines.push('        StringBuilder sb = new StringBuilder();');
  lines.push(`        sb.append(pad).append("${cls.name}:\\n");`);

  // Print inherited attributes via super if there is a parent
  if (parent) {
    lines.push('        sb.append(super.prettyPrint(indent + 1));');
  }

  for (const attr of ownAttrs) {
    const field = safeId(attr.name);
    if (attr.upperBound !== 1) {
      lines.push(`        sb.append(pad).append("  ${field}: ").append(${field}).append("\\n");`);
    } else {
      lines.push(`        sb.append(pad).append("  ${field}: ").append(${field}).append("\\n");`);
    }
  }

  for (const rel of relations) {
    const targetCls = metaModel.classes.find(c => c.id === rel.target);
    if (!targetCls) continue;
    const field = getRelationFieldName(rel, targetCls);
    if (isMultiRelation(rel)) {
      lines.push(`        sb.append(pad).append("  ${field}:\\n");`);
      lines.push(`        for (${targetCls.name} item : ${field}) { sb.append(item.prettyPrint(indent + 2)); }`);
    } else {
      lines.push(`        if (${field} != null) { sb.append(pad).append("  ${field}:\\n").append(${field}.prettyPrint(indent + 2)); }`);
    }
  }

  lines.push('        return sb.toString();');
  lines.push('    }');
  lines.push('');
  lines.push('    public String prettyPrint() { return prettyPrint(0); }');
  lines.push('}');

  return lines.join('\n');
}

// ── Instance model file generator ────────────────────────────────────────────

function generateInstanceFile(im, metaModel, pkg) {
  const className = toClassName(im.name);
  const lines     = [];

  lines.push(`package ${pkg};`);
  lines.push('');
  lines.push(`public class ${className} {`);
  lines.push('');
  lines.push('    public static void main(String[] args) {');
  lines.push('');

  // Build unique variable name map
  const varNames     = new Map();
  const usedVarNames = new Set();
  for (const obj of im.objects) {
    const objCls = metaModel.classes.find(c => c.id === obj.classId);
    let base    = safeId(obj.name || objCls?.name);
    let varName = base;
    let counter = 2;
    while (usedVarNames.has(varName)) varName = base + counter++;
    usedVarNames.add(varName);
    varNames.set(obj.id, varName);
  }

  // ── Instantiate objects ───────────────────────────────────────────
  if (im.objects.length > 0) {
    lines.push('        // Instantiate objects');
    for (const obj of im.objects) {
      const objCls = metaModel.classes.find(c => c.id === obj.classId);
      const objClassName = objCls?.name ?? obj.classId;
      lines.push(`        ${objClassName} ${varNames.get(obj.id)} = new ${objClassName}();`);
    }
    lines.push('');
  }

  // ── Set attribute values ──────────────────────────────────────────
  // Optional attributes (lowerBound=0) with no value are left uninitialized (no setter call).
  // Required attributes (lowerBound>0) with no value fall back to the type default.
  const attrLines = [];
  for (const obj of im.objects) {
    const allAttrs = getAllAttributes(obj.classId, metaModel);
    const varName  = varNames.get(obj.id);
    for (const attr of allAttrs) {
      const rawVal = obj.attributeValues?.[attr.id];
      const cap    = capitalize(safeId(attr.name));
      if (Array.isArray(rawVal)) {
        const nonEmpty = rawVal.filter(v => v && String(v).trim());
        if (nonEmpty.length > 0) {
          for (const val of nonEmpty) {
            attrLines.push(`        ${varName}.add${cap}(${javaLiteral(val, attr.type)});`);
          }
        } else if (attr.lowerBound > 0) {
          attrLines.push(`        ${varName}.add${cap}(${javaLiteral(defaultValue(attr.type).replace(/^"|"$/g, ''), attr.type)});`);
        }
      } else {
        const val = rawVal ? String(rawVal).trim() : '';
        if (val) {
          attrLines.push(`        ${varName}.set${cap}(${javaLiteral(val, attr.type)});`);
        } else if (hasMetaDefault(attr)) {
          attrLines.push(`        ${varName}.set${cap}(${javaLiteral(attr.defaultValue, attr.type)});`);
        } else if (attr.lowerBound > 0) {
          attrLines.push(`        ${varName}.set${cap}(${defaultValue(attr.type)});`);
        }
      }
    }
  }
  if (attrLines.length > 0) {
    lines.push('        // Set attribute values');
    lines.push(...attrLines);
    lines.push('');
  }

  // ── Set relations ─────────────────────────────────────────────────
  const relLines = [];
  for (const link of im.links) {
    const rel       = metaModel.relations.find(r => r.id === link.relationId);
    if (!rel) continue;
    const srcVar    = varNames.get(link.source);
    const tgtVar    = varNames.get(link.target);
    if (!srcVar || !tgtVar) continue;
    const targetCls = metaModel.classes.find(c => c.id === rel.target);
    if (!targetCls) continue;
    const field = getRelationFieldName(rel, targetCls);
    const cap   = capitalize(field);
    if (isMultiRelation(rel)) {
      relLines.push(`        ${srcVar}.add${cap}(${tgtVar});`);
    } else {
      relLines.push(`        ${srcVar}.set${cap}(${tgtVar});`);
    }
  }
  if (relLines.length > 0) {
    lines.push('        // Set relations');
    lines.push(...relLines);
    lines.push('');
  }

  // ── Print object states ───────────────────────────────────────────
  if (im.objects.length > 0) {
    lines.push('        // Print object states');
    for (const obj of im.objects) {
      lines.push(`        System.out.println(${varNames.get(obj.id)});`);
    }
    lines.push('');
  }

  // ── Print relation summary (generated from model — no runtime traversal) ──
  if (im.links.length > 0) {
    lines.push('        // Print relation summary');
    lines.push('        System.out.println("\\nRelations:");');
    for (const link of im.links) {
      const rel    = metaModel.relations.find(r => r.id === link.relationId);
      if (!rel) continue;
      const srcVar = varNames.get(link.source);
      const tgtVar = varNames.get(link.target);
      if (!srcVar || !tgtVar) continue;
      const label  = rel.name && rel.name.trim() ? rel.name : rel.kind.toLowerCase();
      lines.push(`        System.out.println("  " + "${srcVar}" + "  --[${label}]-->  " + "${tgtVar}");`);
    }
    lines.push('');
  }

  lines.push('    }');
  lines.push('}');

  return lines.join('\n');
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateJavaCode(metaModel, instanceModels) {
  const pkgName = `iml.${toPackageName(metaModel.name)}`;
  const pkgDir  = `iml/${toPackageName(metaModel.name)}`;

  const files = [];

  for (const cls of metaModel.classes) {
    files.push({
      path:    `${pkgDir}/${cls.name}.java`,
      content: generateClassFile(cls, metaModel, pkgName),
    });
  }

  for (const im of instanceModels) {
    files.push({
      path:    `${pkgDir}/${toClassName(im.name)}.java`,
      content: generateInstanceFile(im, metaModel, pkgName),
    });
  }

  return files;
}
