import { GetStaticProps, GetStaticPaths } from 'next';
import Link from 'next/link';
import { getClient } from '@/lib/apollo-client';
import { GET_QUIZ_BY_SLUG, GET_ALL_QUIZ_SLUGS } from '@/graphql/queries/quiz';
import { prefetchMenus, mergeMenuState } from '@/lib/prefetchMenus';
import { decodeEntities } from '@/lib/decodeEntities';
import Layout from '@/components/Layout';
import QuizFlow from '@/components/quiz/QuizFlow';
import { Quiz } from '@/types/quiz';

interface QuizPageProps {
  quiz: Quiz;
}

export default function QuizPage({ quiz }: QuizPageProps) {
  if (!quiz) {
    return (
      <Layout title="Quiz Not Found">
        <div className="quiz-flow quiz-flow--not-found">
          <h1>Quiz Not Found</h1>
          <p>The quiz you are looking for does not exist.</p>
          <Link href="/shop" className="btn-primary">Browse All Products</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={quiz.title}>
      <QuizFlow quiz={quiz} />
    </Layout>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  try {
    const client = getClient();
    const { data } = await client.query({ query: GET_ALL_QUIZ_SLUGS });
    const paths = data?.quizzes?.nodes?.map((q: { slug: string }) => ({
      params: { slug: q.slug },
    })) || [];
    return { paths, fallback: 'blocking' };
  } catch (err) {
    console.error('Failed to fetch quiz slugs:', err);
    return { paths: [], fallback: 'blocking' };
  }
};

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const slug = typeof params?.slug === 'string' ? params.slug : '';

  try {
    const [menuClient, quizRes] = await Promise.all([
      prefetchMenus(),
      getClient()
        .query({ query: GET_QUIZ_BY_SLUG, variables: { slug } })
        .catch(() => null),
    ]);

    const raw = quizRes?.data?.quiz;
    if (!raw) {
      return { notFound: true, revalidate: 60 };
    }

    const quiz: Quiz = {
      ...raw,
      title: decodeEntities(raw.title),
      quizFields: raw.quizFields
        ? {
            ...raw.quizFields,
            introHeading: decodeEntities(raw.quizFields.introHeading),
            introSubcopy: decodeEntities(raw.quizFields.introSubcopy),
            resultsHeading: decodeEntities(raw.quizFields.resultsHeading),
            questions: (raw.quizFields.questions ?? []).map(
              (question: Record<string, any>) => ({
                ...question,
                questionText: decodeEntities(question.questionText),
                answers: (question.answers ?? []).map(
                  (answer: Record<string, any>) => ({
                    ...answer,
                    label: decodeEntities(answer.label),
                  })
                ),
              })
            ),
          }
        : raw.quizFields,
    };

    const result = {
      props: { quiz } as Record<string, any>,
      revalidate: 60,
    };
    mergeMenuState(result.props, menuClient);
    return result;
  } catch (err) {
    console.error('Failed to fetch quiz:', err);
    // Without revalidate, one WordPress blip caches this 404 with no expiry and
    // only a redeploy clears it.
    return { notFound: true, revalidate: 60 };
  }
};
