// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.

struct VOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>
}

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> VOut {
    var out: VOut;

    // Define the vertex positions and UVs for the single traingle that covers the screen
    let vertexPoses = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0)
    );

    out.pos = vec4<f32>(vertexPoses[vertexIndex], 0.0, 1.0);

    out.uv = vertexPoses[vertexIndex] * 0.5 + 0.5;

    return out;
}