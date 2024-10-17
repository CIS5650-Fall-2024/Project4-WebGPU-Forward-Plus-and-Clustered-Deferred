// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texCoord: vec2<f32>,
};

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;

    let positions = array<vec2<f32>, 3>(
        vec2(-1.0, -1.0),  // 左下角
        vec2(3.0, -1.0),   // 右下角延伸到屏幕外
        vec2(-1.0, 3.0)    // 左上角延伸到屏幕外
    );

    output.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
    output.texCoord = (positions[vertexIndex] + vec2(1.0, 1.0)) * 0.5;

    return output;
}
