// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(0) @binding(0) var<uniform> viewProjectMat: mat4x4f;
@group(0) @binding(1) var<uniform> projInverseMat: mat4x4f;
@group(0) @binding(2) var<uniform> viewInverseMat: mat4x4f;
@group(0) @binding(3) var<storage, read> lightSet: LightSet;
@group(0) @binding(4) var<storage, read> clusterSet: ClusterSet;


@group(1) @binding(0) var colorTexture: texture_2d<f32>;
@group(1) @binding(1) var normalTexture: texture_2d<f32>;
@group(1) @binding(2) var depthTexture: texture_depth_2d;
struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
}

const clusterPerDim = 16u;

@fragment
fn main(in: VertexOutput) -> @location(0) vec4f {
    let color = textureLoad(colorTexture, vec2<i32>(in.position.xy), 0).xyz;
    var normal = textureLoad(normalTexture, vec2<i32>(in.position.xy), 0).xyz;
    normal = normalize(normal * 2.0 - 1.0);
    let depth = textureLoad(depthTexture, vec2<i32>(in.position.xy), 0);

    // Reconstruct world position from depth
    let uv_x = in.uv.x;
    let uv_y = in.uv.y;
    var clipSpace = vec4f(uv_x * 2.0 - 1.0, uv_y * 2.0 - 1.0, depth, 1.0);
    var viewSpace = projInverseMat * clipSpace;
    viewSpace /= viewSpace.w;
    var worldPos = (viewInverseMat * viewSpace).xyz;

    // Find the cluster index
    let ndcSpacePos = clipSpace.xyz / clipSpace.w;
    let x = ndcSpacePos.x * 0.5 + 0.5;
    let y = 0.5 - ndcSpacePos.y * 0.5;
    let z = ndcSpacePos.z;

    let x_idx = u32(x * f32(clusterPerDim));
    let y_idx = u32(y * f32(clusterPerDim));
    let z_idx = u32(z * f32(clusterPerDim));

    let clusterIdx = x_idx + y_idx * clusterPerDim + z_idx * clusterPerDim * clusterPerDim;
    let clusterLightCount = clusterSet.clusters[clusterIdx].numLights;

    var totalLightContrib = vec3f(0.0);
    for (var lightIdx = 0u; lightIdx < clusterLightCount; lightIdx++) {
        let light = lightSet.lights[clusterSet.clusters[clusterIdx].lightIndices[lightIdx]];
        totalLightContrib += calculateLightContrib(light, worldPos, normal);
    }

    var finalColor = color.rgb * totalLightContrib;
    // finalColor = vec3f(depth, depth, depth);
    return vec4f(finalColor, 1.0);
}