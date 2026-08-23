import { describe, expect, it } from 'vitest'
import {
  TEMPLATE_PROPERTIES,
  WHITE_POLICIES,
  describeTemplateIntent,
  parseTemplateIntent,
  serializeTemplateIntent,
  templateIntentSwatch,
  templatePropertiesForFamily,
  templatePropertyFor,
  type TemplateIntent,
} from './templateIntent'
import { ATTRIBUTE_FAMILIES } from './attributeFamily'

/**
 * The client half of the intent grammar, pinned against the backend's.
 *
 * `TemplateIntent.kt` is the authority — resolution happens there and only there — so the value of
 * these tests is that the two agree on the *strings*. A client that serialised `pct:75.0` where the
 * server writes `pct:75` would produce a template whose stored value churns on every save, and a
 * client whose vocabulary drifted would offer a property the write boundary refuses.
 */
describe('templateIntent', () => {
  const cases: [TemplateIntent, string][] = [
    [{ kind: 'colour', hex: '#FF9D4A', policy: 'extract' }, '#FF9D4A;policy=extract'],
    [{ kind: 'colour', hex: '#FF9D4A', policy: 'additive' }, '#FF9D4A;policy=additive'],
    [{ kind: 'colour', hex: '#FF9D4A', policy: 'rgbonly' }, '#FF9D4A;policy=rgbonly'],
    [{ kind: 'percent', value: 75 }, 'pct:75'],
    [{ kind: 'percent', value: 12.5 }, 'pct:12.5'],
    [{ kind: 'position', panDeg: 45, tiltDeg: -12.5 }, 'deg:45,-12.5'],
    [{ kind: 'switch', on: true }, 'on'],
    [{ kind: 'switch', on: false }, 'off'],
  ]

  it('serialises to exactly the strings the backend writes', () => {
    for (const [intent, serialised] of cases) {
      expect(serializeTemplateIntent(intent)).toBe(serialised)
    }
  })

  it('round-trips every arm', () => {
    for (const [intent, serialised] of cases) {
      expect(parseTemplateIntent(serialised)).toEqual(intent)
    }
  })

  it('reads a colour with no policy token as RGB only', () => {
    // Matching Kotlin, and matching what every *other* reader of that string already does with it:
    // both `parseExtendedColour` implementations ignore an unknown `;`-token, so the safe reading of
    // "no policy stated" is the one that drives no extra emitters.
    expect(parseTemplateIntent('#FF9D4A')).toEqual({
      kind: 'colour',
      hex: '#FF9D4A',
      policy: 'rgbonly',
    })
  })

  it('reads an unknown policy as RGB only rather than throwing', () => {
    expect(parseTemplateIntent('#FF9D4A;policy=sideways')).toEqual({
      kind: 'colour',
      hex: '#FF9D4A',
      policy: 'rgbonly',
    })
  })

  it('answers null for anything that is not an intent', () => {
    for (const raw of ['', '   ', '#GGGGGG', 'pct:', 'deg:45', 'deg:a,b', '#12345', 'maybe', '128']) {
      expect(parseTemplateIntent(raw), raw).toBeNull()
    }
  })

  it('clamps a percentage on the way in', () => {
    expect(parseTemplateIntent('pct:180')).toEqual({ kind: 'percent', value: 100 })
    expect(parseTemplateIntent('pct:-20')).toEqual({ kind: 'percent', value: 0 })
  })

  it('gives a colour row a swatch and everything else none', () => {
    // What the library row and the resolves-to panel key their rendering off.
    expect(templateIntentSwatch('#FF9D4A;policy=extract')).toBe('#FF9D4A')
    expect(templateIntentSwatch('pct:75')).toBeNull()
    expect(templateIntentSwatch('deg:45,12')).toBeNull()
  })

  it('describes each arm in the language a row shows', () => {
    expect(describeTemplateIntent('#FF9D4A;policy=extract')).toBe('#FF9D4A · Extract')
    expect(describeTemplateIntent('pct:75')).toBe('75%')
    expect(describeTemplateIntent('deg:45,-12.5')).toBe('45° / -12.5°')
    expect(describeTemplateIntent('on')).toBe('On')
    // A value it cannot parse is shown as-is rather than as an empty cell: a row that renders blank
    // reads as "no value", which is the one thing it definitely is not.
    expect(describeTemplateIntent('nonsense')).toBe('nonsense')
  })

  describe('the property vocabulary', () => {
    it('matches the backend list exactly', () => {
      // Mirrors `TemplateProperty` in `fx/TemplateIntent.kt`, in declaration order. Kept as a
      // literal rather than derived: an assertion that rebuilds what it is checking passes just as
      // happily when the source is wrong. `maskPicker.test.ts` pins the family list the same way.
      expect(TEMPLATE_PROPERTIES.map((p) => p.propertyName)).toEqual([
        'dimmer',
        'strobe',
        'position',
        'rgbColour',
        'zoom',
        'focus',
        'iris',
        'frost',
        'prism',
      ])
    })

    it('is closed — a slotted role is refused, and so is a misspelling', () => {
      // Where "a template cannot carry a gobo" lives on this side. The backend refuses it too; this
      // is what stops the editor offering it in the first place.
      for (const refused of ['gobo', 'goboRotation', 'ledMacro', 'movementMacro', 'dimer', '']) {
        expect(templatePropertyFor(refused), refused).toBeNull()
      }
    })

    it('collapses the three colour spellings onto one entry', () => {
      for (const spelling of ['colour', 'color', 'rgbColour', 'RGBCOLOUR']) {
        expect(templatePropertyFor(spelling)?.propertyName, spelling).toBe('rgbColour')
      }
    })

    it('puts strobe in intensity, not beam', () => {
      // Mirrors `PropertyCategory.STROBE.maskGroup()`: an intensity modulation, HTP like a dimmer.
      expect(templatePropertyFor('strobe')?.family).toBe('INTENSITY')
      expect(templatePropertiesForFamily('INTENSITY').map((p) => p.propertyName)).toEqual([
        'dimmer',
        'strobe',
      ])
    })

    it('gives every family at least one property, so no family is unauthorable', () => {
      for (const family of ATTRIBUTE_FAMILIES) {
        expect(templatePropertiesForFamily(family).length, family).toBeGreaterThan(0)
      }
    })

    it('has exactly three white policies, matching WhitePolicy', () => {
      expect([...WHITE_POLICIES]).toEqual(['extract', 'additive', 'rgbonly'])
    })
  })
})
