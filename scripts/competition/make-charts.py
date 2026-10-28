"""Figures from measured JSON only; rerun after a new benchmark, no hand-entered scores."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties
root=Path(__file__).resolve().parents[2]
out=root/'public/evidence/media'
out.mkdir(parents=True,exist_ok=True)
font=FontProperties(fname='C:/Windows/Fonts/msyh.ttc')
plt.rcParams.update({'font.family':font.get_name(),'axes.unicode_minus':False,'font.size':17,'savefig.facecolor':'#f5f4ed','figure.facecolor':'#f5f4ed','axes.facecolor':'#f5f4ed','text.color':'#214839','axes.labelcolor':'#214839','xtick.color':'#627267','ytick.color':'#214839'})
reports={name:json.loads((root/f'public/evidence/vision-{name}.json').read_text(encoding='utf-8')) for name in ['development-lite','development-full','holdout-lite','holdout-full']}
fig,ax=plt.subplots(figsize=(13,5.5),layout='constrained')
labels=['第一批 · Lite','第一批 · Full','第二批 · Lite','第二批 · Full']
for i,key in enumerate(['development-lite','development-full','holdout-lite','holdout-full']):
    s=reports[key]['summary']['current']; ax.barh(i,s['tp'],color='#28624c',height=.53);ax.barh(i,s['fn'],left=s['tp'],color='#dedfd1',height=.53)
    ax.text(s['tp']/2,i,f"检出 {s['tp']}",ha='center',va='center',color='white',fontsize=17)
    ax.text(s['tp']+s['fn']/2,i,f"漏检 {s['fn']}",ha='center',va='center',fontsize=17)
    ax.text(8.2,i,f"日常动作误触发 {s['fp']}/8",va='center',fontsize=16)
ax.set_yticks(range(4),labels);ax.invert_yaxis();ax.set_xlim(0,11);ax.set_xticks([0,2,4,6,8]);ax.set_xlabel('每批包含 8 个实验摔倒片段；分母包括未建立基准与遮挡片段',fontsize=15,labelpad=15)
for spine in ax.spines.values():spine.set_visible(False)
ax.tick_params(axis='y',length=0,pad=15);ax.tick_params(axis='x',length=0)
fig.savefig(out/'vision-results.png',dpi=160);plt.close(fig)
fig,axes=plt.subplots(2,1,figsize=(12,6),sharex=True,layout='constrained')
report=reports['development-full'];clip=next(c for c in report['clips'] if c['id']=='fall-06');samples=clip['samples'];times=[s['ms']/1000 for s in samples]
axes[0].plot(times,[s['angle'] for s in samples],color='#28624c',linewidth=2.8,label='实测画面倾角')
axes[0].axhline(55,color='#a5864d',ls='--',label='起始倾角门槛 55°');axes[0].set_ylabel('倾角 / °');axes[0].set_ylim(0,95);axes[0].legend(loc='upper left',frameon=False,fontsize=13)
axes[1].plot(times,[s.get('dropRatio') for s in samples],color='#28624c',linewidth=2.8,label='实测相对下降')
axes[1].axhline(.6,color='#a5864d',ls='--',label='下降门槛 0.6 倍');axes[1].set_ylabel('下降 / 基准躯干长度');axes[1].set_xlabel('输入视频时间 / s（非检测延迟）');axes[1].legend(loc='upper left',frameon=False,fontsize=13)
for ax in axes:
    for trigger in clip['alarms']:ax.axvline(trigger/1000,color='#b2603d',ls=':',lw=2)
    ax.grid(axis='y',color='#dce2d7');ax.spines[['top','right']].set_visible(False)
fig.savefig(out/'fall-trace.png',dpi=160);plt.close(fig)
print('Saved figures from four measured JSON runs; no manually entered scores.')
