"""Blender finish pass for every original den prop. No Higgsfield mesh is imported.
Blender -b -P tools/blender/build-den-room.py -- <games-hub> <work-directory>
The captured procedural source preserves UVs and runtime object identities.
"""
import os,sys,json,math
ROOT=os.path.abspath(sys.argv[sys.argv.index('--')+1])
exec(open(os.path.join(ROOT,'tools/blender/build-den.py'),encoding='utf8').read().split('\nsofa()\n')[0])
import bmesh
bpy.ops.wm.read_factory_settings(use_empty=True)
source=json.load(open(os.path.join(ROOT,'tools/blender/den-source.json')))
neutral=material('geometry only',(1,1,1))
wood=material('warm walnut',(.19,.085,.032),.66)
edge=material('end grain',(.31,.16,.065),.76)
brass=material('aged brass',(.43,.29,.11),.42,.66)
steel=material('satin steel',(.26,.30,.32),.4,.7)
black=material('rubber and recess',(.012,.017,.019),.77)
cream=material('ivory paper',(.79,.73,.58),.92)
fabric=material('woven speaker cloth',(.19,.15,.10),.98)
green=material('tank leaf',(.035,.19,.085),.83)
stone=material('river gravel',(.22,.20,.15),.93)
red=material('oxblood',(.33,.026,.017),.69)
card=material('corrugated cardboard',(.40,.26,.12),.98)
wire=material('insulated cable',(.025,.025,.022),.86)

def sphere(name,loc,dims,mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=1,location=G(*loc))
    o=bpy.context.object;o.name=name;o.scale=(dims[0],dims[2],dims[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=True
    return o
def cyl(name,loc,r,h,mat,rt=None):
    bpy.ops.mesh.primitive_cone_add(vertices=32,radius1=r,radius2=r if rt is None else rt,depth=h,location=G(*loc))
    o=bpy.context.object;o.name=name;o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=True
    return o
def line(name,pts,r,mat):return tube(name,[G(*p) for p in pts],r,mat)
def join(obs,name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs:o.select_set(True)
    bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();o=bpy.context.object;o.name=name
    bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');o.select_set(False)
    return o
def batch_detail(key,fn):
    before=set(bpy.context.scene.objects);fn();obs=list(set(bpy.context.scene.objects)-before)
    parent=bpy.data.objects.new('detail_'+key,None);bpy.context.collection.objects.link(parent)
    mats=set(o.data.materials[0] for o in obs if o.type=='MESH' and o.data.materials)
    groups=[(m,[o for o in obs if o.type=='MESH' and o.data.materials[0]==m]) for m in mats]
    for m,group in groups:
        o=join(group,key+'_'+m.name);o.parent=parent
    return parent

def raw_mesh(s):
    key=s['key'];p=s['positions'];vs=[G(*p[i:i+3]) for i in range(0,len(p),3)]
    ix=s['indices'] or list(range(len(vs)));fs=[ix[i:i+3] for i in range(0,len(ix),3)]
    me=bpy.data.meshes.new(key);me.from_pydata(vs,[],fs);me.update()
    ob=bpy.data.objects.new(key,me);bpy.context.collection.objects.link(ob);me.materials.append(neutral)
    if s['uv']:
        uv=me.uv_layers.new(name='original UV')
        for po in me.polygons:
            for li in po.loop_indices:
                vi=me.loops[li].vertex_index;uv.data[li].uv=(s['uv'][vi*2],1-s['uv'][vi*2+1])
    if s['type']=='BoxGeometry':
        bm=bmesh.new();bm.from_mesh(me);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
        bmesh.ops.dissolve_limit(bm,angle_limit=.001,use_dissolve_boundaries=False,verts=list(bm.verts),edges=list(bm.edges));bm.to_mesh(me);bm.free()
        params=s['parameters'];small=min(params['width'],params['height'],params['depth'])
        b=ob.modifiers.new('rounded manufactured edges','BEVEL');b.width=min(.008,small*.12);b.segments=3
        bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=b.name)
        for po in me.polygons:po.use_smooth=True
        n=ob.modifiers.new('weighted face normals','WEIGHTED_NORMAL');n.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=n.name)
    return ob

def crate_mesh(s):
    obs=[]
    obs.append(cube('bottom',(0,-.14,0),(.42,.02,.34),neutral,.003))
    for x in [-.198,.198]:
        for z in [-.158,.158]:obs.append(cube('post',(x,0,z),(.024,.30,.024),neutral,.003))
    for y in [-.10,-.025,.055,.13]:
        for z in [-.161,.161]:obs.append(cube('slat',(0,y,z),(.42,.041,.018),neutral,.003))
        for x in [-.201,.201]:obs.append(cube('slat',(x,y,0),(.018,.041,.30),neutral,.003))
    return join(obs,s['key'])
def open_box(s):
    w,h,d=[s['parameters'][k] for k in ['width','height','depth']];obs=[]
    obs.append(cube('box floor',(0,-h/2+.006,0),(w,.012,d),neutral,.002))
    for x in [-w/2+.005,w/2-.005]:obs.append(cube('box side',(x,0,0),(.01,h,d),neutral,.002))
    for z in [-d/2+.005,d/2-.005]:obs.append(cube('box side',(0,0,z),(w,h,.01),neutral,.002))
    return join(obs,s['key'])
def fish(s):
    body=sphere('body',(0,0,0),(.038,.019,.011),neutral)
    vs=[G(-.031,0,0),G(-.060,.022,-.003),G(-.060,-.022,-.003),G(-.060,.022,.003),G(-.060,-.022,.003),G(-.005,.012,0),G(-.013,.032,0),G(.018,.013,0)]
    me=bpy.data.meshes.new('fins');me.from_pydata(vs,[],[(0,1,2),(0,4,3),(1,3,4,2),(5,6,7),(7,6,5)]);me.materials.append(neutral)
    fin=bpy.data.objects.new('fins',me);bpy.context.collection.objects.link(fin)
    return join([body,fin],s['key'])
def pleated_shade(s):
    vs=[];N=96
    for y,r in [(-.12,.19),(.12,.075)]:
        for i in range(N):
            a=i/N*math.tau;rr=r+(.004 if i%2 else -.004);vs.append(G(rr*math.cos(a),y,rr*math.sin(a)))
    faces=[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)]
    me=bpy.data.meshes.new('pleated linen');me.from_pydata(vs,[],faces);me.materials.append(neutral)
    o=bpy.data.objects.new(s['key'],me);bpy.context.collection.objects.link(o);return o

for s in source['sources']:
    if s['key']=='recordCrate':crate_mesh(s)
    elif s['key']=='hauntBox':open_box(s)
    elif s['key'].startswith('fish'):fish(s)
    elif s['key']=='bat':
        outline=[(-.09,-.02),(-.058,.013),(-.025,.006),(-.012,.031),(0,.017),(.012,.031),(.025,.006),(.058,.013),(.09,-.02),(.054,-.005),(.035,-.022),(0,-.007),(-.035,-.022),(-.054,-.005)]
        vs=[G(x,y,z) for y in [-.004,.004] for x,z in outline];n=len(outline)
        me=bpy.data.meshes.new('scalloped foam bat');me.from_pydata(vs,[],[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]);me.materials.append(neutral)
        ob=bpy.data.objects.new('bat',me);bpy.context.collection.objects.link(ob)
    elif s['key']=='lampShade':pleated_shade(s)
    elif s['type'] in ['CylinderGeometry','ConeGeometry'] and not s['mapped']:
        p=s['parameters'];cyl(s['key'],(0,0,0),p.get('radiusBottom',p.get('radius',.1)),p['height'],neutral,p.get('radiusTop',0 if s['type']=='ConeGeometry' else None))
    else:raw_mesh(s)

def coffee():
    cube('lower magazine shelf',(0,.16,0),(.87,.025,.43),wood,.008)
    for z in [-.21,.21]:cube('apron',(0,.335,z),(.91,.075,.025),wood,.005)
    for x in [-.45,.45]:cube('apron',(x,.335,0),(.025,.075,.43),wood,.005)
    for i in range(3):
        o=cube('paperback',(-.18+i*.014,.188+i*.022,0),(.26,.018,.18),cream if i%2 else red,.003);o.rotation_euler.z=.10-i*.06
    cyl('coaster',(-.32,.434,.12),.047,.006,edge)
    cyl('mug',(-.32,.48,.12),.031,.083,cream,.033)
    cyl('tea',(-.32,.524,.12),.027,.001,wood)
    tube('cup handle',[G(-.355-.017*math.sin(i/16*math.pi),.48+.028*math.cos(i/16*math.pi),.12) for i in range(17)],.004,cream)
def cigar():
    for x in [-.10,.10]:cube('hinge',(x,.069,-.081),(.026,.016,.012),brass,.002)
    cube('clasp',(0,.046,.089),(.028,.027,.007),brass,.002)
    for x in [-.119,.119]:
        for z in [-.074,.074]:cube('brass corner',(x,.092,z),(.02,.003,.02),brass,.001)
def cart():
    for x in [-.43,.43]:
        for z in [-.25,.25]:
            cube('caster bracket',(x,.085,z),(.058,.04,.058),steel,.004)
            sphere('caster axle',(x+.027,.045,z),(.007,.009,.009),steel)
    cube('console vent',(0.07,.512,.10),(.17,.002,.09),black,.001)
    for i in range(11):cube('console grille',(-.002+i*.014,.514,.10),(.004,.003,.08),steel,.001)
    cube('cartridge slot',(.02,.512,.03),(.20,.004,.013),black,.002)
    cube('power switch',(-.105,.513,.19),(.027,.007,.014),red,.002)
    for x,z,turn in [(-.28,.55,.9),(.18,.55,.55)]:
        # Controller detail follows each existing pad's yaw.
        def P(a,b,c):return (x+a*math.cos(turn)+c*math.sin(turn),b,z-a*math.sin(turn)+c*math.cos(turn))
        cube('D-pad horizontal',P(-.033,.065,0),(.035,.007,.01),black,.002)
        cube('D-pad vertical',P(-.033,.066,0),(.010,.007,.035),black,.002)
        for v in [-.011,.013]:cyl('controller button',P(.033,.066,v),.009,.006,red)
        line('controller lead',[P(0,.05,-.042),(x,.025,.41),(x*.5,.028,.35),(.06,.40,.29),(.04,.47,.247)],.004,wire)
def records():
    # Recessed cloth fronts and a raised timber perimeter.
    for x in [-.32,.32]:
        cube('speaker cloth',(x,.35,-.224),(.36,.37,.010),fabric,.008)
        for j in range(17):cube('woven vertical',(x-.17+j*.021,.35,-.231),(.002,.345,.002),edge,.0005)
        for j in range(17):cube('woven horizontal',(x,.18+j*.021,-.232),(.34,.001,.001),cream,.0004)
    cube('control rail',(0,.565,-.233),(.97,.056,.020),wood,.006)
    for x in [-.07,.025,.12]:
        knob=cyl('tuning knob',(x,.565,-.249),.015,.018,brass);knob.rotation_euler.x=math.pi/2
    cube('radio dial',(-.27,.565,-.246),(.21,.025,.002),black,.002)
    for i in range(13):cube('dial tick',(-.36+i*.014,.565,-.249),(.001,.014,.001),cream,.0002)
    # Platter remains the original mesh; concentric grooves and tonearm dress it.
    for rad in [.062,.078,.096,.116,.137,.151]:tube('vinyl groove',[G(-.22+rad*math.cos(i*math.tau/64),.634,rad*math.sin(i*math.tau/64)) for i in range(64)],.0008,steel,True)
    cyl('record label',(-.22,.635,0),.046,.001,red)
    cyl('spindle',(-.22,.638,0),.004,.012,steel)
    cyl('tonearm pivot',(.075,.643,-.12),.022,.04,steel)
    line('tonearm',[(.075,.667,-.12),(.075,.673,.015),(-.04,.665,.08)],.005,steel)
    cube('cartridge',(-.045,.652,.085),(.025,.016,.037),black,.003)
    cube('lid hinge rail',(0,.623,-.206),(1.06,.023,.025),brass,.003)
def aquarium():
    for y in [.35,.85]:
        for z in [-.191,.191]:cube('tank rim',(0,y,z),(.858,.035,.025),black,.004)
        for x in [-.418,.418]:cube('tank rim',(x,y,0),(.025,.035,.38),black,.004)
    for x in [-.409,.409]:
        for z in [-.182,.182]:cube('silicone edge',(x,.60,z),(.011,.47,.011),black,.002)
    cube('hood',(0,.88,-.04),(.86,.038,.29),black,.006)
    for x in [-.218,.218]:
        cube('cabinet door',(x,0,.218),(.409,.53,.015),wood,.006)
        cube('door inset',(x,0,.228),(.341,.43,.008),edge,.008)
        knob=cyl('door knob',(x*.28,.07,.245),.012,.018,brass);knob.rotation_euler.x=math.pi/2
    for i in range(42):
        x=-.35+(i*37%83)/83*.70;z=-.13+(i*19%59)/59*.26
        sphere('gravel',(x,.410+(i%3)*.002,z),(.009+(i%4)*.003,.006,.011),stone)
    for x,z,h in [(-.28,-.07,.24),(.29,-.09,.32),(.19,.09,.18)]:
        for j in range(5):
            xx=x+(j-2)*.013
            line('plant stem',[(xx,.42,z),(xx+.012,.42+h*.5,z+.02),(xx+.03,.42+h,z)],.003,green)
            for k in [1,2,3]:
                leaf=sphere('leaf',(xx+.018*(-1)**k,.42+h*k/4,z+.01),(.038,.006,.015),green);leaf.rotation_euler.y=(-1)**k*.55
    cube('filter',(0.32,.68,-.138),(.085,.21,.063),black,.012)
    line('filter tube',[(.32,.76,-.13),(.32,.88,-.13),(.20,.88,-.13),(.20,.77,-.13)],.009,black)
def heater():
    for y in [.067,1.565]:cyl('rolled seam',(0,y,0),.345,.020,steel)
    cube('control box',(0,.44,.338),(.13,.14,.038),black,.009)
    knob=cyl('thermostat',(0,.47,.365),.025,.014,red);knob.rotation_euler.x=math.pi/2
    cube('service plate',(0,.90,.343),(.19,.27,.004),cream,.004)
    for i in range(7):cube('printed service line',(0,.98-i*.021,.347),(.135 if i%2 else .15,.004,.001),black,.0002)
    for x in [-.19,.19]:
        line('water connector',[(x,1.58,0),(x,1.87,0),(x+.1,1.91,0)],.016,brass)
        cyl('pipe collar',(x,1.61,0),.029,.025,steel)
    line('drain',[(.12,.15,.30),(.12,.15,.39)],.012,brass)
def furnace():
    for y,h in [(-.27,.43),(.265,.48)]:cube('service panel',(0,y,.306),(.75,h,.012),steel,.009)
    for i in range(12):cube('louver',(0,.08+i*.028,.318),(.58,.010,.008),black,.002)
    for x in [-.34,.34]:
        for y in [-.46,-.08,.075,.46]:sphere('fastener',(x,y,.318),(.004,.004,.003),brass)
    cube('duct transition',(0,.725,0),(.43,.34,.38),steel,.012)
    cube('inspection label',(-.20,-.25,.32),(.20,.09,.003),cream,.002)
    cube('filter pull',(.23,-.27,.331),(.05,.11,.015),black,.005)
def neon():
    for x in [-.575,.575]:cube('sign frame',(x,0,-.003),(.026,.50,.04),brass,.005)
    for y in [-.247,.247]:cube('sign frame',(0,y,-.003),(1.15,.026,.04),brass,.005)
    for x in [-.24,.24]:line('shelf bracket',[(x,-.43,.005),(x,-.32,.12),(x,-.32,.005)],.006,brass)
    for x in [-.22,0,.21]:
        cyl('bottle cap',(x,-.062,.06),.011,.012,brass)
        cube('bottle label',(x,-.204,.083),(.030,.050,.002),cream,.003)
    line('power cord',[(.55,-.2,-.002),(.54,-.44,.01),(.46,-.60,.008),(.46,-1.10,.008)],.004,wire)
def haunt():
    # No new game art: retain the existing label, photo and seasonal bulbs.
    for x in [-.287,.287]:cube('corrugated rim',(x,.397,0),(.013,.006,.43),edge,.001)
    for i in range(7):cube('skull tooth',(.125+i*.012,.411,.113),(.009,.022,.018),cream,.003)
    line('light string',[(-.34-i/16*.44,.44-i/16*.40+math.sin(i/16*3.1)*.05,.02+i/16*.20) for i in range(17)],.003,wire)
    for i in range(6):cube('walkie speaker groove',(-.098,.493+i*.007,.16),(.029,.002,.002),black,.0005)
    for i in range(3):sphere('walkie control',(-.116+i*.014,.567,.15),(.005,.006,.004),brass)
def watch():
    for x,z,turn in [(-.16,-.06,0),(-.02,-.10,.2),(.12,-.05,-.15),(-.10,.10,3),(.06,.13,3.2)]:
        for side in [-1,1]:
            cube('toy boot',(x+side*.005,.014,z+.003),(.007,.012,.013),green,.002)
        helmet=sphere('toy helmet',(x,.065,z),(.011,.006,.011),green)
        line('toy arm',[(x-.009,.048,z),(x-.011,.032,z+.009),(x+.005,.033,z+.016)],.003,green)
def lamp():
    for y,r in [(-.12,.19),(.12,.075)]:tube('shade binding',[G(r*math.cos(i*math.tau/64),y,r*math.sin(i*math.tau/64)) for i in range(64)],.0035,cream,True)
    cyl('weighted foot',(0,-1.394,0),.17,.045,brass)
    cyl('lamp collar',(0,-.20,0),.047,.10,brass,.022)
    line('pull chain',[(.10,-.075,0),(.10,-.24,0)],.002,brass)
    sphere('chain bead',(.10,-.25,0),(.008,.012,.008),brass)
def window():
    for x in [-.40,.40]:cube('frame stile',(x,0,.042),(.045,.40,.035),steel,.004)
    for y in [-.19,.19]:cube('frame rail',(0,y,.042),(.80,.043,.035),steel,.004)
    cube('centre mullion',(0,0,.057),(.025,.36,.023),steel,.003)
    cube('hopper latch',(0,.137,.073),(.06,.019,.024),brass,.003)
    cube('window sill',(0,-.23,.06),(.95,.055,.19),stone,.008)
def pole():
    for y in [-1.057,1.054]:cube('column plate',(0,y,0),(.20,.022,.20),steel,.004)
    for x in [-.072,.072]:
        for z in [-.072,.072]:cyl('anchor bolt',(x,-1.038,z),.009,.016,brass)
def rolled():
    for h in [-.53,.52]:
        for i in range(48):
            a=i/48*math.tau;sphere('rug tie',(math.cos(a)*.131,h,math.sin(a)*.131),(.006,.007,.006),cream)
    for rad in [.031,.052,.075,.099,.122]:tube('rolled textile layers',[G(rad*math.cos(i*math.tau/64),.801,rad*math.sin(i*math.tau/64)) for i in range(64)],.002,cream,True)
def room():
    # Perimeter trim stays outside the walking floor and stair arrival zone.
    fl=-2.42
    for z in [-2.267,4.467]:
        cube('baseboard',(-2.05,fl+.055,z),(10.43,.11,.026),wood,.006)
        cube('skirting cap',(-2.05,fl+.116,z),(10.43,.018,.034),edge,.004)
    for x in [-7.266,3.166]:
        cube('baseboard',(x,fl+.055,1.1),(.026,.11,6.72),wood,.006)
    for x in [-6.1,-4.4,-2.7,-1,.7,2.2]:
        for z in [1.972,2.328]:cube('duct seam',(x,-.52,z),(.019,.264,.009),steel,.002)
        cube('duct seam',(x,-.655,2.15),(.019,.009,.35),steel,.002)
        for z in [-.62,-.50]:
            line('pipe saddle',[(x,-.28,z),(x,-.40,z)],.009,steel)
    # Rounded handrail on the lower flight, below the den ceiling.
    line('stair handrail',[(-7.20,-.52,1.55),(-7.20,-1.57,2.51),(-7.20,-1.59,2.58)],.025,wood)
    for y,z in [(-.68,1.72),(-1.39,2.37)]:line('rail bracket',[(-7.27,y-.025,z),(-7.20,y-.025,z),(-7.20,y,z)],.007,brass)
    # Outlets, cable route and the porcelain stair-bulb socket.
    for x in [-.5,-4.8]:
        cube('outlet plate',(x,fl+.33,4.466),(.074,.12,.01),cream,.005)
        for yy in [fl+.308,fl+.352]:
            for xx in [x-.012,x+.012]:cube('outlet slot',(xx,yy,4.459),(.003,.012,.002),black,.001)
    cyl('porcelain socket',(-6.97,-.49,2.35),.056,.085,cream,.04)
    # Labels and tape distinguish the two storage cartons.
    for x,z,angle,label in [(-6.85,3.85,0,'SCHOOL'),(-6.35,3.95,.3,'MISC')]:
        def P(a,b,c):return(x+a*math.cos(angle)+c*math.sin(angle),fl+b,z-a*math.sin(angle)+c*math.cos(angle))
        o=cube('packing tape',P(0,.343,0),(.048,.003,.318),cream,.001);o.rotation_euler.z=-angle
        o=cube('box label',P(0,.18,-.163),(.20,.07,.002),cream,.002);o.rotation_euler.z=-angle
        bpy.ops.object.text_add(location=G(*P(.082,.166,-.165)));t=bpy.context.object;t.name='written '+label;t.data.body=label;t.data.size=.027;t.data.extrude=.0002;t.data.materials.append(black);t.rotation_euler=(math.pi/2,0,math.pi-angle);bpy.ops.object.convert(target='MESH')
    # Frames hold the nostalgic print off the wood paneling.
    for x in [-1.4,-3.6]:
        for xx in [x-.266,x+.266]:cube('poster frame',(xx,fl+1.55,4.458),(.025,.72,.022),wood,.004)
        for y in [fl+1.198,fl+1.902]:cube('poster frame',(x,y,4.458),(.55,.025,.022),wood,.004)

for key,fn in [('coffee',coffee),('cigar',cigar),('cart',cart),('records',records),('aquarium',aquarium),('heater',heater),('furnace',furnace),('neon',neon),('haunt',haunt),('watch',watch),('lamp',lamp),('window',window),('pole',pole),('rolled',rolled),('room',room)]:batch_detail(key,fn)
export('den-craft')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WORK,'den-craft.blend'))
print('DEN_ROOM_COMPLETE')
