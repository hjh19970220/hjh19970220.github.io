from pathlib import Path
p=Path('index.html')
s=p.read_text()
s=s.replace("function hj泊松进球模型ScoreData", "function hjPoissonScoreData")
s=s.replace("hj泊松进球模型ScoreData(", "hjPoissonScoreData(")
s=s.replace("const m={'数据质量A级':'A级（数据完整可靠）','数据质量B级':'B级（主链可靠，少量辅助缺失）','数据质量C级':'C级（存在重要数据缺口）','数据质量D级':'D级（核心数据冲突或不足）'};", "const m={'DQ-A':'A级（数据完整可靠）','DQ-B':'B级（主链可靠，少量辅助缺失）','DQ-C':'C级（存在重要数据缺口）','DQ-D':'D级（核心数据冲突或不足）'};")
p.write_text(s)
print('fixed internal display keys')
