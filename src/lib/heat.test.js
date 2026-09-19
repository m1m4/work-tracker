import { describe, expect, it } from 'vitest'
import { heatLevel, heatReference, HEAT_LEVELS } from './heat.js'

const week = (...days) => [...days, ...Array(7 - days.length).fill(0)]

describe('heatReference', () => {
  it('is a fifth of the weekly goal on an ordinary week', () => {
    expect(heatReference(week(0, 8, 7, 6, 8), 40)).toBe(8)
  })

  it('does not shrink to fit a quiet week', () => {
    // The point of a fixed scale: two hours is a light day whatever else
    // happened that week.
    expect(heatReference(week(0, 2, 1), 40)).toBe(8)
  })

  it('stretches for a day that went past a full one', () => {
    expect(heatReference(week(0, 8, 13), 40)).toBe(13)
  })

  it('follows a smaller goal down', () => {
    expect(heatReference(week(0, 3, 4), 20)).toBe(4)
  })

  it('falls back to the busiest day when there is no goal', () => {
    expect(heatReference(week(0, 5), 0)).toBe(5)
  })

  it('is zero for an empty week with no goal', () => {
    expect(heatReference(week(), 0)).toBe(0)
  })
})

describe('heatLevel', () => {
  it('gives a day with nothing on it no heat at all', () => {
    expect(heatLevel(0, 8)).toBe(0)
  })

  it('climbs through the levels as the day fills up', () => {
    expect(heatLevel(1, 8)).toBe(1)
    expect(heatLevel(2.8, 8)).toBe(1)
    expect(heatLevel(4, 8)).toBe(2)
    expect(heatLevel(6, 8)).toBe(3)
    expect(heatLevel(7.5, 8)).toBe(HEAT_LEVELS)
  })

  it('tops out rather than running off the end', () => {
    expect(heatLevel(20, 8)).toBe(HEAT_LEVELS)
  })

  it('puts the busiest day at the top, since it sets the reference', () => {
    const days = week(0, 3, 11)
    expect(heatLevel(11, heatReference(days, 40))).toBe(HEAT_LEVELS)
  })

  it('treats a negative or missing value as an empty day', () => {
    expect(heatLevel(-1, 8)).toBe(0)
    expect(heatLevel(undefined, 8)).toBe(0)
  })

  it('does not divide by a reference of zero', () => {
    expect(heatLevel(2, 0)).toBe(HEAT_LEVELS)
  })
})
