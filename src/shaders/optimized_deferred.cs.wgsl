@group(0) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;
@group(0) @binding(2) var unityTex: texture_2d<u32>;
@group(0) @binding(3) var outputTex: texture_storage_2d<bgra8unorm, write>; // the format could be wrong
// @group(0) @binding(4) var bloomTex: texture_storage_2d<rgba16float, write>; 

@group(1) @binding(0) var<uniform> res: Resolution;
@group(1) @binding(1) var<uniform> tileInfo: TileInfo;
@group(1) @binding(2) var<storage> tilesLightIdxBuffer: array<u32>;
@group(1) @binding(3) var<storage> tilesLightGridBuffer: array<u32>;

@compute @workgroup_size(${lightCullBlockSize}, ${lightCullBlockSize}, 1)
fn computeMain(@builtin(global_invocation_id) global_id: vec3u,
    @builtin(local_invocation_id) local_id: vec3u,
    @builtin(workgroup_id) workgroup_id: vec3u,
    @builtin(num_workgroups) numTiles: vec3u) 
{
    var fragCoord = vec2<f32>(f32(global_id.x), f32(global_id.y));
    var UV = vec2<f32>(fragCoord.x / f32(res.width), fragCoord.y / f32(res.height));
    var screenCoord = vec2u(u32(fragCoord.x), u32(fragCoord.y));
    var unityVec = textureLoad(unityTex, screenCoord, 0);
    var albedo = vec3<f32>(0.0, 0.0, 0.0);
    albedo.r = f32((unityVec.z >> 24) & 0xFF) / 255.0;
    albedo.g = f32((unityVec.z >> 16) & 0xFF) / 255.0;
    albedo.b = f32((unityVec.z >> 8) & 0xFF) / 255.0;

    var normal = vec3<f32>(0.0, 0.0, 0.0);
    normal.x = f32((unityVec.x >> 16) & 0xFFFF) / 65535.0;
    normal.y = f32((unityVec.x) & 0xFFFF) / 65535.0;
    normal.z = f32((unityVec.y >> 16) & 0xFFFF) / 65535.0;
    normal = normal * 2.0 - 1.0; // unpack normal


    var depth = f32((unityVec.y) & 0xFFFF) / 65535.0;

    var clipPos = vec3<f32>(UV.x * 2.0 - 1.0, 1.0 - UV.y * 2.0, depth);
    var viewPos = clipToView(vec4(clipPos, 1.0), cameraUniforms.invProj);
    var worldPos = clipToWorld(vec4(clipPos, 1.0), cameraUniforms.invViewProj);

    // exponential depth
    depth = (-viewPos.z - cameraUniforms.near) / (cameraUniforms.far - cameraUniforms.near);
    depth = cameraUniforms.near * pow(cameraUniforms.far / cameraUniforms.near, depth);

    var tileXidx = u32(floor(UV.x * f32(tileInfo.numTilesX)));
    var tileYidx = u32(floor(UV.y * f32(tileInfo.numTilesY)));
    var tileZidx = u32(floor(depth * f32(tileInfo.numTilesZ)));
    var clusterIdx = tileZidx * tileInfo.numTilesX * tileInfo.numTilesY + tileYidx * tileInfo.numTilesX + tileXidx;

    var totalLightContrib = vec3<f32>(0.0, 0.0, 0.0);
    var startLightIdx = clusterIdx * u32(${maxLightsPerTile});
    var lightCount = tilesLightGridBuffer[clusterIdx];
    for (var i = 0u; i < lightCount; i = i + 1u) {
        var lightIdx = tilesLightIdxBuffer[startLightIdx + i];
        var light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, worldPos, normal.xyz);
    }
    

    var finalColor = albedo.rgb * totalLightContrib;
    // finalColor = vec3(f32(lightCount) / 1000.0);

    textureStore(outputTex, screenCoord, vec4<f32>(finalColor, 1.0));
}