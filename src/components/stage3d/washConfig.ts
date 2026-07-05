// Stage-3D atmosphere & pixel-bar wash tuning. These are code-level knobs, not
// UI settings — tweak the values here. Shared by the cone/pool emitters
// (StageEmitters) and the PixelStrip glow so the floor wash and the mid-air
// glow stay consistent (e.g. WASH_ANGLE_DEG shapes both).

/** Mid-air volume strength. 1 = normal beams; 0 = surfaces only (no haze in the
 *  air); >1 = denser, smokier room. Surface pools are unaffected. */
export const HAZE_LEVEL = 1

/** Full cone angle (deg) shared by each pixel's floor/region wash pool and its
 *  mid-air glow cone. Wider = softer / more spread; narrower = tighter with more
 *  per-pixel colour separation. */
export const WASH_ANGLE_DEG = 90

/** Per-pixel wash pool opacity 0..1 (additive). Low so a bar's overlapping
 *  pixels blend as colour rather than blowing out to white. */
export const WASH_OPACITY = 0.3
