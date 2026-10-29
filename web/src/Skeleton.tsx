// Placeholder shapes shown while PayPal data loads. They match the real layout, so nothing
// jumps when the content arrives. Screen readers hear one "Loading…" line instead.

const Line = ({ w, h = 12 }: { w: string; h?: number }) => (
  <span className="sk" style={{ width: w, height: h }} aria-hidden="true" />
)

export function CaseSkeleton() {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        Loading case from PayPal…
      </span>
      <section className="case-head" aria-hidden="true">
        <div className="sk-stack">
          <Line w="40%" h={20} />
          <Line w="55%" />
        </div>
        <div className="case-head-right">
          <Line w="72px" h={20} />
          <Line w="96px" h={18} />
        </div>
        <div className="asks">
          <Line w="38%" />
        </div>
      </section>
      <div className="columns" aria-hidden="true">
        <div className="stack">
          <section className="panel sk-stack">
            <Line w="34%" h={10} />
            {['92%', '78%', '64%', '48%'].map((w) => (
              <span key={w} className="sk-item">
                <Line w="26px" h={18} />
                <Line w={w} />
              </span>
            ))}
          </section>
          <section className="panel sk-stack">
            <Line w="22%" h={10} />
            <Line w="90%" />
            <Line w="70%" />
          </section>
        </div>
        <section className="panel sk-stack">
          <Line w="40%" h={10} />
          {['88%', '74%', '82%', '90%', '66%'].map((w) => (
            <span key={w} className="sk-item">
              <Line w="26px" h={18} />
              <span className="sk-stack tight">
                <Line w={w} />
                <Line w="45%" h={9} />
              </span>
            </span>
          ))}
        </section>
      </div>
    </div>
  )
}

export function ListSkeleton() {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        Loading disputes from PayPal…
      </span>
      <div className="list" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="row sk-row">
            <Line w="64px" h={16} />
            <Line w="90px" />
            <span className="sk-full">
              <Line w="140px" h={10} />
            </span>
            <span className="sk-full sk-pills">
              <Line w="110px" h={18} />
              <Line w="90px" h={18} />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
