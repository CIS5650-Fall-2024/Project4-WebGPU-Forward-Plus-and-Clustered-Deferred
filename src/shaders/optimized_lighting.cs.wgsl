// File: shaders/optimized_lighting.cs.wgsl

@group(0) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;
@group(0) @binding(2) var<storage, read> clusterLights: array<u32>;
@group(0) @binding(3) var gBufferTex: texture_2d<u32>;
@group(0) @binding(4) var depthTex: texture_depth_2d;
@group(0) @binding(5) var outputTex: texture_storage_2d<rgba8unorm, write>;


fn decode(v: vec2f) -> vec3f {
    let f = v * 2.0 - 1.0;
    var n = vec3f(f.xy, 1.0 - abs(f.x) - abs(f.y));
    let t = saturate(-n.z);
    n.x += select(t, -t, n.x >= 0.0);
    n.y += select(t, -t, n.y >= 0.0);
    return normalize(n);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
    let x = global_id.x;
    let y = global_id.y;

    if (x >= u32(cameraUniforms.screenWidth) || y >= u32(cameraUniforms.screenHeight)) {
        return;
    }

    let uv = vec2u(x, y);
    let uvf = vec2f(f32(x) + 0.5, f32(y) + 0.5);

    // 读取 G-buffer 数据
    let data = textureLoad(gBufferTex, uv, 0);
    let packedDiffuse = data.x;
    let packedNormal = data.y;
    let packedDepth = data.z;

    // 解压 Albedo 颜色
    let diffuseColorVec4 = unpack4x8unorm(packedDiffuse);
    let albedo = diffuseColorVec4.rgb;

    // 解压法线
    let encodedNormal = unpack2x16unorm(packedNormal);
    let normal = decode(encodedNormal);

    // 解压深度
    let depth = bitcast<f32>(packedDepth);

    // 通过深度重建视图空间位置
    let ndc = vec3f(
        (f32(x) / f32(cameraUniforms.screenWidth)) * 2.0 - 1.0,
        ((f32(cameraUniforms.screenHeight) - f32(y)) / f32(cameraUniforms.screenHeight)) * 2.0 - 1.0,
        depth * 2.0 - 1.0  // NDC z 在 [-1,1]
    );
    let clipPos = vec4f(ndc, 1.0);
    var viewPos = cameraUniforms.invProjMat * clipPos;
    viewPos = viewPos / viewPos.w;

    // Calculate cluster indices using logarithmic depth
    let screenWidth = cameraUniforms.screenWidth;
    let screenHeight = cameraUniforms.screenHeight;

    let xCluster = u32(uvf.x / screenWidth * f32(${clusterCountX}));
    let yCluster = u32(uvf.y / screenHeight * f32(${clusterCountY}));

    let depthView = -viewPos.z;
    let near = cameraUniforms.nearPlane;
    let far = cameraUniforms.farPlane;

    let logRatio = log(far / near);
    var zClusterF32 = (log(depthView / near) / logRatio) * f32(${clusterCountZ});
    var zCluster = u32(floor(zClusterF32));

    let clusterIdX = clamp(xCluster, 0u, ${clusterCountX}u - 1u);
    let clusterIdY = clamp(yCluster, 0u, ${clusterCountY}u - 1u);
    let clusterIdZ = clamp(zCluster, 0u, ${clusterCountZ}u - 1u);

    let clusterIndex = clusterIdX + clusterIdY * ${clusterCountX}u + clusterIdZ * ${clusterCountX}u * ${clusterCountY}u;
    let clusterOffset = clusterIndex * (1u + ${maxLightsPerCluster}u);

    let numLights = clusterLights[clusterOffset];

    var totalLightContrib = vec3f(0.0);

    for (var i = 0u; i < numLights; i = i + 1u) {
        let lightIdx = clusterLights[clusterOffset + 1u + i];
        let light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, viewPos.xyz, normal);
    }

    var finalColor = albedo * totalLightContrib;

    textureStore(outputTex, uv, vec4f(finalColor, 1.0));
}
