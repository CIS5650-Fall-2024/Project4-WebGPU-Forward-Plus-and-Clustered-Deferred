@vertex
fn main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let positions = array(
    vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0),
    vec2(-1.0, 1.0), vec2(1.0, -1.0), vec2(1.0, 1.0),
  );

  return vec4f(positions[index], 0.0f, 1.0f);
}