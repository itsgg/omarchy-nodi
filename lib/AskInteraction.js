.pragma library

// Pure, bounded ACP interaction state. Transport stays in Ask.qml; this
// module decides which protocol shapes are safe and which live binding owns
// them.
var LIMITS = {
  commands: 48,
  commandName: 64,
  text: 500,
  plan: 64,
  planText: 2000,
  actions: 16,
  actionTitle: 200,
  actionText: 8192,
  argv: 32,
  arg: 4096,
  fields: 24,
  fieldName: 64,
  fieldText: 4096,
  enum: 32,
  sessions: 50,
  sessionId: 256,
  path: 4096,
  metadataBytes: 131072
}

function object(value) {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function text(value, max) {
  if (typeof value !== "string") return ""
  return value.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").trim().slice(0, max)
}

function opaque(value, max) {
  return typeof value === "string" && value.length > 0
    && value.length <= max && !/[\u0000-\u001f\u007f-\u009f]/.test(value)
    ? value : ""
}

function utf8Bytes(value, stop) {
  var bytes = 0
  for (var i = 0; i < value.length; i++) {
    var c = value.charCodeAt(i)
    if (c < 0x80) bytes++
    else if (c < 0x800) bytes += 2
    else if (c >= 0xd800 && c <= 0xdbff
             && i + 1 < value.length
             && value.charCodeAt(i + 1) >= 0xdc00
             && value.charCodeAt(i + 1) <= 0xdfff) {
      bytes += 4
      i++
    } else bytes += 3
    if (bytes > stop) return bytes
  }
  return bytes
}

function copyState(state) {
  return {
    process: state.process,
    session: state.session,
    turn: state.turn,
    commands: state.commands,
    plans: state.plans,
    actions: state.actions,
    sessions: state.sessions,
    nextCursor: state.nextCursor,
    form: state.form
  }
}

function create(process, session, turn) {
  return {
    process: String(process || ""),
    session: String(session || ""),
    turn: String(turn || ""),
    commands: [],
    plans: [],
    actions: [],
    sessions: [],
    nextCursor: "",
    form: null
  }
}

function bound(state, process, session, turn) {
  return !!state
    && state.process === String(process || "")
    && state.session === String(session || "")
    && state.turn === String(turn || "")
}

function bind(state, process, session, turn) {
  var p = String(process || "")
  var s = String(session || "")
  var t = String(turn || "")
  if (!state || state.process !== p || state.session !== s) return create(p, s, t)
  if (state.turn === t) return state
  var next = copyState(state)
  next.turn = t
  next.plans = []
  next.actions = []
  next.form = null
  return next
}

function commandOf(value) {
  if (!object(value)) return null
  var name = opaque(value.name, LIMITS.commandName)
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)) return null
  var input = null
  if (object(value.input)) {
    var hint = text(value.input.hint, LIMITS.text)
    input = hint || value.input.required === true
      ? { hint: hint, required: value.input.required === true }
      : null
  }
  return { name: name, description: text(value.description, LIMITS.text), input: input }
}

function commandsOf(update) {
  var list = object(update) && Array.isArray(update.availableCommands)
    ? update.availableCommands : []
  var out = []
  var seen = Object.create(null)
  for (var i = 0; i < list.length && out.length < LIMITS.commands; i++) {
    var command = commandOf(list[i])
    if (!command || seen[command.name]) continue
    seen[command.name] = true
    out.push(command)
  }
  return out
}

function plansOf(update) {
  var list = object(update) && Array.isArray(update.entries) ? update.entries : []
  var statuses = { pending: true, in_progress: true, completed: true, blocked: true }
  var priorities = { low: true, medium: true, high: true }
  var out = []
  for (var i = 0; i < list.length && out.length < LIMITS.plan; i++) {
    if (!object(list[i])) continue
    var content = text(list[i].content, LIMITS.planText)
    if (!content) continue
    var status = text(list[i].status, 32)
    var priority = text(list[i].priority, 32)
    out.push({
      content: content,
      status: statuses[status] ? status : "",
      priority: priorities[priority] ? priority : ""
    })
  }
  return out
}

function update(state, process, session, turn, value) {
  if (!bound(state, process, session, turn) || !object(value)) return state
  var next = copyState(state)
  if (value.sessionUpdate === "available_commands_update")
    next.commands = commandsOf(value)
  else if (value.sessionUpdate === "plan")
    next.plans = plansOf(value)
  else return state
  return next
}

function actionOf(value, turn) {
  if (!object(value) || !object(value.action)) return null
  var title = text(value.title, LIMITS.actionTitle)
  if (!title) return null
  var source = value.action
  var keys = ["prompt", "exec", "open", "copy", "paste", "query"]
  var present = keys.filter(function(key) {
    return Object.prototype.hasOwnProperty.call(source, key)
  })
  if (present.length !== 1) return null
  var key = present[0]
  var action = {}
  if (key === "exec") {
    if (!Array.isArray(source.exec) || !source.exec.length
        || source.exec.length > LIMITS.argv) return null
    var argv = []
    for (var i = 0; i < source.exec.length; i++) {
      if (typeof source.exec[i] !== "string"
          || source.exec[i].length > LIMITS.arg
          || /[\u0000]/.test(source.exec[i])) return null
      argv.push(source.exec[i])
    }
    action.exec = argv
  } else {
    var valueText = typeof source[key] === "string"
      && source[key].length <= LIMITS.actionText ? source[key] : ""
    if (!valueText || /\u0000/.test(valueText)) return null
    if (key === "open" && !/^(?:https?|mailto):/i.test(valueText))
      return null
    action[key] = valueText
  }
  return { title: title, action: action, turn: String(turn || "") }
}

function finish(state, process, session, turn, result) {
  if (!bound(state, process, session, turn)) return state
  var meta = object(result) && object(result._meta) && object(result._meta.nodi)
    ? result._meta.nodi : null
  if (meta) {
    var encoded = ""
    try { encoded = JSON.stringify(meta) } catch (e) { encoded = "" }
    if (!encoded || utf8Bytes(encoded, LIMITS.metadataBytes)
        > LIMITS.metadataBytes) meta = null
  }
  var list = meta && Array.isArray(meta.actions) ? meta.actions : []
  var out = []
  for (var i = 0; i < list.length && out.length < LIMITS.actions; i++) {
    var action = actionOf(list[i], turn)
    if (action) out.push(action)
  }
  var next = copyState(state)
  next.actions = out
  return next
}

function secretName(name) {
  return /(?:password|passcode|token|secret|api.?key|private.?key|recovery|payment|card)/i.test(name)
}

function fieldOf(name, schema, required) {
  if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/.test(name)
      || secretName(name)) return null
  if (!object(schema)) schema = {}
  if (secretName(String(schema.title || ""))
      || secretName(String(schema.description || ""))
      || /^(?:password|secret)$/i.test(String(schema.format || "")))
    return null
  var type = schema.type
  var enums = []
  var sourceEnum = Array.isArray(schema.enum) ? schema.enum : []
  for (var ei = 0; ei < sourceEnum.length && enums.length < LIMITS.enum; ei++) {
    var enumValue = sourceEnum[ei]
    if (typeof enumValue === "string") {
      if (enumValue.length <= LIMITS.fieldText
          && !/[\u0000-\u001f\u007f-\u009f]/.test(enumValue))
        enums.push(enumValue)
    } else if (typeof enumValue === "number" && isFinite(enumValue))
      enums.push(enumValue)
  }
  if (enums.length) type = "enum"
  else if (type === "string" && (schema.format === "textarea"
           || schema.multiline === true)) type = "multiline"
  if (["string", "multiline", "boolean", "integer", "number", "enum"].indexOf(type) < 0)
    return {
      name: name,
      title: text(schema.title, LIMITS.text) || name,
      description: "This field type is not supported.",
      type: "unsupported",
      required: required,
      enum: [],
      minimum: null,
      maximum: null,
      maxLength: 0,
      value: null
    }
  var fallback
  if (type === "boolean") fallback = false
  else if (type === "integer" || type === "number") {
    fallback = 0
    if (typeof schema.minimum === "number" && isFinite(schema.minimum)
        && fallback < schema.minimum) fallback = type === "integer"
          ? Math.ceil(schema.minimum) : schema.minimum
    if (typeof schema.maximum === "number" && isFinite(schema.maximum)
        && fallback > schema.maximum) fallback = type === "integer"
          ? Math.floor(schema.maximum) : schema.maximum
  } else if (type === "enum") fallback = enums[0]
  else fallback = ""
  var field = {
    name: name,
    title: text(schema.title, LIMITS.text) || name,
    description: text(schema.description, LIMITS.text),
    type: type,
    required: required,
    enum: enums,
    minimum: typeof schema.minimum === "number" && isFinite(schema.minimum) ? schema.minimum : null,
    maximum: typeof schema.maximum === "number" && isFinite(schema.maximum) ? schema.maximum : null,
    maxLength: Math.max(1, Math.min(LIMITS.fieldText, Number(schema.maxLength) || LIMITS.fieldText)),
    value: fallback
  }
  if (schema.default !== undefined) {
    var given = validFieldValue(field, schema.default)
    if (given !== null) field.value = given
  }
  return field
}

function formOf(id, params) {
  if (!object(params) || params.mode !== "form") return null
  var schema = object(params.requestedSchema) ? params.requestedSchema : {}
  if (schema.type !== undefined && schema.type !== "object") return null
  var encoded = ""
  try { encoded = JSON.stringify(schema) } catch (e) { encoded = "" }
  if (!encoded || utf8Bytes(encoded, LIMITS.metadataBytes)
      > LIMITS.metadataBytes) return null
  var properties = object(schema.properties) ? schema.properties : {}
  var required = Array.isArray(schema.required) ? schema.required : []
  var fields = []
  var keys = Object.keys(properties)
  for (var r = 0; r < required.length; r++) {
    var requiredName = required[r]
    if (typeof requiredName !== "string"
        || !Object.prototype.hasOwnProperty.call(properties, requiredName)
        || !fieldOf(requiredName, properties[requiredName], true))
      return null
  }
  for (var i = 0; i < keys.length && fields.length < LIMITS.fields; i++) {
    var field = fieldOf(keys[i], properties[keys[i]], required.indexOf(keys[i]) >= 0)
    if (!field && required.indexOf(keys[i]) >= 0) return null
    if (field) fields.push(field)
  }
  for (var ri = 0; ri < required.length; ri++) {
    var included = false
    for (var fi = 0; fi < fields.length; fi++)
      if (fields[fi].name === required[ri]) { included = true; break }
    if (!included) return null
  }
  return {
    id: id,
    message: text(params.message, LIMITS.text),
    fields: fields
  }
}

function elicit(state, process, session, turn, id, params) {
  if (!bound(state, process, session, turn)
      || !object(params) || params.sessionId !== state.session || state.form)
    return state
  var form = formOf(id, params)
  if (!form) return state
  var next = copyState(state)
  next.form = form
  return next
}

function validFieldValue(field, value) {
  if (field.type === "unsupported") return null
  if (field.type === "boolean") return typeof value === "boolean" ? value : null
  if (field.type === "integer" || field.type === "number") {
    var number = typeof value === "number" ? value : Number(value)
    if (!isFinite(number) || (field.type === "integer" && Math.floor(number) !== number)) return null
    if (field.minimum !== null && number < field.minimum) return null
    if (field.maximum !== null && number > field.maximum) return null
    return number
  }
  if (field.type === "enum")
    return field.enum.indexOf(value) >= 0 ? value : null
  if (typeof value !== "string") return null
  return value.slice(0, field.maxLength)
}

function setField(state, name, value) {
  if (!state || !state.form) return state
  var fields = state.form.fields.map(function(field) {
    if (field.name !== name) return field
    var valid = validFieldValue(field, value)
    if (valid !== null) return Object.assign({}, field, { value: valid })
    if ((field.type === "integer" || field.type === "number")
        && typeof value === "string")
      return Object.assign({}, field, { value: value.slice(0, LIMITS.fieldText) })
    return field
  })
  var next = copyState(state)
  next.form = Object.assign({}, state.form, { fields: fields })
  return next
}

function formResult(state, action) {
  if (!state || !state.form)
    return { ok: false, response: { action: "cancel" }, state: state }
  var next = copyState(state)
  var form = state.form
  next.form = null
  if (action !== "accept")
    return { ok: true, response: { action: "cancel" }, state: next }
  var content = Object.create(null)
  for (var i = 0; i < form.fields.length; i++) {
    var field = form.fields[i]
    var value = validFieldValue(field, field.value)
    if (value === null || (field.required && typeof value === "string" && !value.trim()))
      return { ok: false, response: { action: "cancel" }, state: state }
    content[field.name] = value
  }
  return { ok: true, response: { action: "accept", content: content }, state: next }
}

function sessionList(result) {
  var list = object(result) && Array.isArray(result.sessions) ? result.sessions : []
  var out = []
  var seen = Object.create(null)
  for (var i = 0; i < list.length && out.length < LIMITS.sessions; i++) {
    var item = list[i]
    if (!object(item)) continue
    var id = opaque(item.sessionId, LIMITS.sessionId)
    if (!id || seen[id]) continue
    seen[id] = true
    out.push({
      sessionId: id,
      title: text(item.title, LIMITS.text),
      cwd: text(item.cwd, LIMITS.path),
      updatedAt: text(item.updatedAt, 100)
    })
  }
  return {
    sessions: out,
    nextCursor: object(result) ? text(result.nextCursor, 1024) : ""
  }
}

function commandPrompt(command, input) {
  if (!command || !command.name) return ""
  var suffix = typeof input === "string" ? input.trim().slice(0, LIMITS.actionText) : ""
  return "/" + command.name + (suffix ? " " + suffix : "")
}
