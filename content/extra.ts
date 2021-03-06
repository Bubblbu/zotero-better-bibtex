// http://docs.citationstyles.org/en/stable/specification.html#appendix-iv-variables
import * as cslVariables from './csl-vars.json'
import * as CSL from '../gen/citeproc'

type TeXString = { value: string, raw?: boolean, type?: 'biblatex' | 'bibtex' }

export type Fields = {
  csl: Record<string, string | string[]>
  tex: Record<string, TeXString>
  citationKey: string
  aliases: string[]
}

type CSLCreator = { literal?: string, isInstitution?: 1, family?: string, given?: string }
type ZoteroCreator = { name?: string, lastName?: string, firstName?: string }

export function cslCreator(value: string): CSLCreator {
  const creator = value.split(/\s*\|\|\s*/)
  if (creator.length === 2) { // tslint:disable-line:no-magic-numbers
    const _creator = { family: creator[0] || '', given: creator[1] || ''}
    CSL.parseParticles(_creator)
    return _creator
  } else {
    // return { literal: value, isInstitution: 1 }
    return { literal: value }
  }
}

export function zoteroCreator(value: string): ZoteroCreator {
  const creator = value.split(/\s*\|\|\s*/)
  if (creator.length === 2) { // tslint:disable-line:no-magic-numbers
    return {lastName: creator[0] || '', firstName: creator[1] || ''}
  } else {
    return { name: value }
  }
}

const re = {
  // fetch fields as per https://forums.zotero.org/discussion/3673/2/original-date-of-publication/. Spurious tex. so I can do a single match
  csl: /^{:((?:bib(?:la)?)?tex\.)?([^:]+)(:)\s*([^}]+)}$/,
  kv: /^((?:bib(?:la)?)?tex\.)?([^:=]+)\s*([:=])\s*([\S\s]*)/,
}

type GetOptions = {
  citationKey?: boolean | string
  aliases?: boolean | string[]
  csl?: boolean | Record<string, string | string[]>
  tex?: boolean | Record<string, TeXString>
}

const noPrefix = ['place', 'lccn', 'mr', 'zbl', 'arxiv', 'jstor', 'hdl', 'googlebooksid']
const casing = {
  arxiv: 'arXiv',
}

export function get(extra: string, options?: GetOptions): { extra: string, extraFields: Fields } {
  if (!options) options = { citationKey: true , aliases: true, csl: true, tex: true }

  extra = extra || ''

  const extraFields: Fields = {
    csl: {},
    tex: {},
    citationKey: '',
    aliases: [],
  }

  extra = extra.split('\n').filter(line => {
    const m = line.match(re.csl) || line.match(re.kv)
    if (!m) return true

    let [ , tex, name, assign, value ] = m
    const raw = (assign === '=')

    if (!tex && raw) return true

    name = name.toLowerCase().trim()
    value = value.trim()

    if (options.citationKey && !tex && options.citationKey && ['citation key', 'bibtex'].includes(name)) {
      extraFields.citationKey = value
      return false
    }

    if (options.aliases && !tex && options.aliases && name === 'citation key alias') {
      extraFields.aliases = value.split(/s*,\s*/).filter(alias => alias)
      return false
    }
    if (options.aliases && tex && !raw && options.aliases && name === 'ids') {
      extraFields.aliases = value.split(/s*,\s*/).filter(alias => alias)
      return false
    }

    if (options.csl && !tex) {
      let cslName = name.replace(/ +/g, '-')
      const cslType = cslVariables[cslName] || cslVariables[cslName = cslName.toUpperCase()]
      if (cslType) {
        if (cslType === 'creator') {
          extraFields.csl[cslName] = (extraFields.csl[cslName] as string[]) || [];
          (extraFields.csl[cslName] as string[]).push(value)
        } else {
          extraFields.csl[cslName] = value
        }
        return false
      }
    }

    if (options.tex && tex && !name.includes(' ')) {
      extraFields.tex[name] = { value, raw }
      if (tex === 'bibtex' || tex === 'biblatex') extraFields.tex[name].type = tex
      return false
    }

    if (options.tex && !tex && noPrefix.includes(name.replace(/-/g, ''))) {
      extraFields.tex[name.replace(/-/g, '')] = { value }
      return false
    }

    return true
  }).join('\n').trim()

  return { extra, extraFields }
}

export function set(extra, options: { citationKey?: string, aliases?: string[], csl?: Record<string, string | string[]>, tex?: Record<string, TeXString>} = {}) {
  const parsed = get(extra, options)

  if (options.citationKey) parsed.extra += `\nCitation Key: ${options.citationKey}`

  if (options.aliases && options.aliases.length) {
    const aliases = Array.from(new Set(options.aliases)).sort().join(', ')
    parsed.extra += `\ntex.ids: ${aliases}`
  }

  if (options.tex) {
    for (const name of Object.keys(options.tex).sort()) {
      const value = options.tex[name]
      const prefix = noPrefix.includes(name) ? '' : 'tex.'
      parsed.extra += `\n${prefix}${casing[name] || name}${value.raw ? '=' : ':'} ${value.value}`
    }
  }

  if (options.csl) {
    for (const name of Object.keys(options.csl).sort()) {
      const value = options.csl[name]
      if (Array.isArray(value)) { // csl creators
        parsed.extra += value.map(creator => `\n${name}: ${value}`).join('') // do not sort!!
      } else {
        parsed.extra += `\n${name}: ${value}`
      }
    }
  }

  return parsed.extra.trim()
}
