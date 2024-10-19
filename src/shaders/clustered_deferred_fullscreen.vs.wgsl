// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.
struct VertexOutput
{
    @builtin(position) fragPos: vec4f,
    @location(0) uv: vec2f
}

@vertex
fn main(
  @builtin(vertex_index) VertexIndex : u32
) -> VertexOutput {

  const pos = array(
    vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0),
    vec2(-1.0, 1.0), vec2(1.0, -1.0), vec2(1.0, 1.0),
  );

  var out: VertexOutput;
  out.fragPos = vec4f(pos[VertexIndex], 0.0, 1.0);
  out.uv = pos[VertexIndex].xy * 0.5 + 0.5;
  out.uv.y = 1.0 - out.uv.y;

  return out;
}