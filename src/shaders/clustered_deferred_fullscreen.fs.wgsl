@group(${bindGroup_scene}) @binding(0) var gBufferAlbedo: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(1) var gBufferNormalAndDepth: texture_2d<f32>;

@group(${bindGroup_scene}) @binding(2) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(3) var<storage, read> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(4) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(5) var<uniform> clusterUniforms: ClusterUniforms;

fn zIndexFromZ(z: f32) -> u32 {
    // Equation from eq. 3 in http://www.aortiz.me/2018/12/21/CG.html#forward-shading,
    return u32((clusterUniforms.clusterDims.z * log(z / camera.near) ) / camera.logFarOverNear);
}

@fragment
fn main(
    @builtin(position) fragCoord: vec4<f32>,
) -> @location(0) vec4f {

    // Prefetch g-buffer data
    let albedo = textureLoad(gBufferAlbedo, vec2i(floor(fragCoord.xy)), 0);
    let normalAndDepth = textureLoad(gBufferNormalAndDepth, vec2i(floor(fragCoord.xy)), 0);
    let normal = vec4f(normalAndDepth.x, normalAndDepth.y, 1.0 - (normalAndDepth.x * normalAndDepth.x + normalAndDepth.y * normalAndDepth.y), 0.0);
    let depth = normalAndDepth.z;

    if (albedo.a < 0.5f) {
        discard;
    }

    // Get view space pos from fragCoord and depth
    let viewPosX = -depth * (2.0 * (fragCoord.x / camera.screenDims.x) - 1.0) * camera.invProjMat[0][0];
    let viewPosY = -depth * (1.0 - 2.0 * (fragCoord.y / camera.screenDims.y)) * camera.invProjMat[1][1];
    var viewPos = vec4f(viewPosX, viewPosY, depth, 1.0);
    let worldPos = camera.invViewMat * viewPos;

    let clusterX = u32((fragCoord.x / camera.screenDims.x) * clusterUniforms.clusterDims.x);
    // Note: WebGPU convention is that the origin is at the top-left corner of the screen
    // https://gpuweb.github.io/gpuweb/wgsl/#position-builtin-value
    let clusterY = u32(((camera.screenDims.y - fragCoord.y) / camera.screenDims.y) * clusterUniforms.clusterDims.y);
    let clusterZ = zIndexFromZ(-viewPos.z);

    let globalClusterIndex = clusterX
                           + (clusterY * u32(clusterUniforms.clusterDims.x))
                           + (clusterZ * u32(clusterUniforms.clusterDims.x * clusterUniforms.clusterDims.y));

    // Retrieve the cluster data for the current fragment
    let clusterLightCount = clusterSet.clusters[globalClusterIndex].lightCount;

    var totalLightContrib = vec3f(0.0);
    for (var lightIdx = 0u; lightIdx < clusterLightCount; lightIdx++) {
        let light = lightSet.lights[clusterSet.clusters[globalClusterIndex].lightIndices[lightIdx]];
        totalLightContrib += calculateLightContrib(light, worldPos.xyz, normal.xyz);
    }

    var finalColor = albedo.rgb * totalLightContrib;
    return vec4(finalColor, 1.0);
}