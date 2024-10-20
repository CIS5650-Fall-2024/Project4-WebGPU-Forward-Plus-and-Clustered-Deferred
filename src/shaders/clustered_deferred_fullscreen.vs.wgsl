// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.
@vertex
fn main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let pos = array<vec2<f32>, 6>(
    vec2(-1.0, -1.0), 
    vec2( 1.0, -1.0), 
    vec2(-1.0,  1.0),

    vec2(-1.0,  1.0), 
    vec2( 1.0, -1.0), 
    vec2( 1.0,  1.0)
  );
  return vec4<f32>(pos[index], 0.0, 1.0);
}