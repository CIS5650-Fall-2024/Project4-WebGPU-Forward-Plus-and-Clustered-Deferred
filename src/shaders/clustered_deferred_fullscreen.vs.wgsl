// Fullscreen Vertex Shader
struct VertexOutput {
    @builtin(position) Position: vec4f,
    @location(0) uv: vec2f
}

@vertex
fn main(@builtin(vertex_index) VertexIndex: u32) -> VertexOutput {
    // Positions of the fullscreen quad vertices
    var positions = array<vec2f, 6>(
        vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
        vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)
    );

    // UV coordinates to pass through to the fragment shader (flip y)
    var uvs = array<vec2f, 6>(
        vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(0.0, 0.0),
        vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0)
    );

    var output: VertexOutput;
    output.Position = vec4f(positions[VertexIndex], 0.0, 1.0);
    output.uv = uvs[VertexIndex];
    return output;
}