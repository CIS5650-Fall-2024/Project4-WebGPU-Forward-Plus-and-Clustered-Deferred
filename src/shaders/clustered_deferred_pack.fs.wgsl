// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) fragPosition: vec3<f32>,
    @location(1) fragNormal: vec3<f32>,
    @location(2) fragUV: vec2<f32>,
};

struct FragmentOutput {
    @location(0) data: vec4u,
};

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;
@fragment
fn main(input: VertexOutput) -> FragmentOutput {
    var output: FragmentOutput;
    let diffColor = textureSample(diffuseTex, diffuseTexSampler, input.fragUV);
    if (diffColor.a < 0.5f) {
        discard;
    }
    let packedDiffuse = pack4x8unorm(diffColor);
    let packedNormal = pack2x16unorm(encode(input.fragNormal));
    let packedDepth : u32 = bitcast<u32>(input.position.z);
    output.data = vec4u(packedDiffuse,packedNormal,packedDepth,1);
    return output;
}

// ref: https://knarkowicz.wordpress.com/2014/04/16/octahedron-normal-vector-encoding/
fn octWrap(v : vec2f) -> vec2f {
    return (1.0 - abs(v.yx)) * vec2f(select(-1.0, 1.0, v.x >= 0.0), select(-1.0, 1.0, v.y >= 0.0));
}

fn encode(n: vec3f) -> vec2f {
    var nor = n.xy / (abs(n.x) + abs(n.y) + abs(n.z));
    nor = select(octWrap(nor), nor, n.z >= 0.0);
    return nor * 0.5 + 0.5;
}