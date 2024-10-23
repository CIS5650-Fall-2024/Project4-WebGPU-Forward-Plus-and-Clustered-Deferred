const SHADING_LEVELS: f32 = 4.0;
const EDGE_THRESHOLD: f32 = 0.01;

var<private> sobelX: array<vec3<i32>, 9> = array<vec3<i32>, 9>(
    vec3<i32>(-1, -1, 0), vec3<i32>( 0, -1, 0), vec3<i32>( 1, -1, 0),
    vec3<i32>(-1,  0, 0), vec3<i32>( 0,  0, 0), vec3<i32>( 1,  0, 0),
    vec3<i32>(-1,  1, 0), vec3<i32>( 0,  1, 0), vec3<i32>( 1,  1, 0)
);

var<private> sobelY: array<vec3<i32>, 9> = array<vec3<i32>, 9>(
    vec3<i32>(-1, -1, 0), vec3<i32>(-1,  0, 0), vec3<i32>(-1,  1, 0),
    vec3<i32>( 0, -1, 0), vec3<i32>( 0,  0, 0), vec3<i32>( 0,  1, 0),
    vec3<i32>( 1, -1, 0), vec3<i32>( 1,  0, 0), vec3<i32>( 1,  1, 0)
);

@group(0) @binding(0) var colorTexture: texture_2d<f32>;
@group(0) @binding(1) var depthTexture: texture_depth_2d;
@group(0) @binding(2) var postprocessedOutput: texture_storage_2d<rgba8unorm, write>;

fn sobelEdgeDetection(coords: vec2<i32>, texSize: vec2<i32>) -> f32 {
    var depthSumX: f32 = 0.0;
    var depthSumY: f32 = 0.0;

    for (var i: u32 = 0; i < 9; i = i + 1u) {
        let offset = sobelX[i].xy;
        let sampleCoords = coords + offset;
        let depth = textureLoad(depthTexture, sampleCoords, 0);

        depthSumX += depth * f32(sobelX[i].z);
        depthSumY += depth * f32(sobelY[i].z);
    }

    return length(vec2<f32>(depthSumX, depthSumY));
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let coords = vec2<i32>(global_id.xy);
    let texSize = vec2<i32>(textureDimensions(colorTexture, 0));

    let color: vec4<f32> = textureLoad(colorTexture, coords, 0);
    let depth: f32 = textureLoad(depthTexture, coords, 0);

    let edgeValue: f32 = sobelEdgeDetection(coords, texSize);

    let toonColor = vec3<f32>(
        round(color.r * SHADING_LEVELS) / SHADING_LEVELS,
        round(color.g * SHADING_LEVELS) / SHADING_LEVELS,
        round(color.b * SHADING_LEVELS) / SHADING_LEVELS
    );

    let finalColor = mix(toonColor, vec3<f32>(0.0), step(EDGE_THRESHOLD, edgeValue));

    textureStore(postprocessedOutput, coords, vec4<f32>(finalColor, 1.0));
}